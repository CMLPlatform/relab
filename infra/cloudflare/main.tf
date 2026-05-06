# spell-checker: ignore cfargotunnel

resource "cloudflare_zero_trust_tunnel_cloudflared" "relab" {
  account_id = var.cloudflare_account_id
  name       = local.tunnel_name
  config_src = "cloudflare"
}

resource "cloudflare_dns_record" "edge" {
  for_each = local.edge_routes

  zone_id = var.cloudflare_zone_id
  name    = each.value.hostname
  content = "${cloudflare_zero_trust_tunnel_cloudflared.relab.id}.cfargotunnel.com"
  type    = "CNAME"
  ttl     = 1
  proxied = true
  comment = "RELab ${var.environment} ${each.key} edge route managed by OpenTofu."
}

resource "cloudflare_zone_setting" "minimum_tls_version" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "tls_1_3" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "tls_1_3"
  value      = "on"
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "relab" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.relab.id

  config = {
    ingress = concat(
      [
        for route in values(local.edge_routes) : {
          hostname = route.hostname
          service  = route.origin
        }
      ],
      [
        # Cloudflare requires a terminal ingress rule; unknown hostnames should not reach an origin.
        {
          service = "http_status:404"
        }
      ]
    )
  }
}

resource "cloudflare_ruleset" "rate_limiting" {
  zone_id     = var.cloudflare_zone_id
  name        = "RELab ${var.environment} API rate limits"
  description = "Zone-level rate limiting for RELab ${var.environment} auth, media upload, and RPi camera endpoints."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    for name, rule in local.rate_limit_rules : {
      ref         = "relab_${var.environment}_${name}"
      description = rule.description
      expression  = rule.expression
      action      = "block"
      action_parameters = {
        response = {
          status_code  = 429
          content_type = "application/json"
          content      = jsonencode({ detail = "Too many requests." })
        }
      }
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = rule.period
        requests_per_period = rule.requests_per_period
        mitigation_timeout  = rule.mitigation_timeout
      }
    }
  ]
}

resource "cloudflare_ruleset" "cache_settings" {
  zone_id     = var.cloudflare_zone_id
  name        = "RELab cache rules"
  description = "Zone-level cache rules for RELab."
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      ref         = "relab_staging_cache_bypass"
      description = "Bypass cache for staging hostnames"
      expression  = local.staging_hosts_expression
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
    }
  ]
}

resource "cloudflare_ruleset" "custom_firewall" {
  zone_id     = var.cloudflare_zone_id
  name        = "RELab custom firewall rules"
  description = "Zone-level custom firewall rules for RELab."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = local.custom_firewall_rules
}
