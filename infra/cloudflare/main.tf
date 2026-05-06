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
