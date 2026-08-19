# Zone-global Cloudflare configuration for cml-relab.org.
#
# prod and staging share this zone, and every resource here is zone-scoped: TLS
# settings and the three entrypoint rulesets. They are owned by this single root
# rather than by either environment's workspace, so no two applies can fight over
# them. Per-environment resources (tunnel, DNS records, tunnel ingress) live in
# ../cloudflare.

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

# Zone entrypoint rulesets: Cloudflare allows exactly one per (zone, phase). They live
# in this root, not in the per-environment one, so there is a single owner.
#
# `name` is "default" on every one of them, which is what Cloudflare calls a zone
# entrypoint. It is not cosmetic: changing the name of an existing entrypoint forces
# replacement, and replacing the firewall entrypoint means a window with no custom
# firewall rules at all. The description carries the human-readable label instead.
resource "cloudflare_ruleset" "rate_limiting" {
  zone_id     = var.cloudflare_zone_id
  name        = "default"
  description = "Zone-level rate limiting for Relab auth, media upload, and RPi camera endpoints (all environments)."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    for name, rule in local.rate_limit_rules : {
      ref         = "relab_${name}"
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
  name        = "default"
  description = "Zone-level cache rules for Relab."
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    # Cloudflare already caches these by file extension and by the origin's own
    # Cache-Control. Stating it makes the intent reviewable and pins it against a
    # zone-setting change made outside this repo, and it covers derivative URLs
    # whatever extension they end in.
    {
      ref         = "relab_uploads_cache"
      description = "Cache stored media at the edge for a year (content-addressed, immutable)"
      expression  = local.uploads_expression
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 31536000
        }
        browser_ttl = {
          mode = "respect_origin"
        }
      }
    },
    {
      ref         = "relab_prod_html_bypass"
      description = "Bypass cache for prod SPA and web HTML entry points"
      expression  = local.prod_html_bypass_expression
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
    },
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
  name        = "default"
  description = "Zone-level custom firewall rules for Relab."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = local.custom_firewall_rules
}
