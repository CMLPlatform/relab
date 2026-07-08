locals {
  cloudflare_zone = var.cloudflare_zone_name

  # Origins are resolved inside the Docker Compose `edge` network by cloudflared.
  edge_routes_by_environment = {
    prod = {
      www = {
        hostname = local.cloudflare_zone
        origin   = "http://www:8081"
      }
      app = {
        hostname = "app.${local.cloudflare_zone}"
        origin   = "http://app:8081"
      }
      api = {
        hostname = "api.${local.cloudflare_zone}"
        origin   = "http://api:8000"
      }
      docs = {
        hostname = "docs.${local.cloudflare_zone}"
        origin   = "http://docs:8000"
      }
    }

    staging = {
      www = {
        hostname = "web-test.${local.cloudflare_zone}"
        origin   = "http://www:8081"
      }
      app = {
        hostname = "app-test.${local.cloudflare_zone}"
        origin   = "http://app:8081"
      }
      api = {
        hostname = "api-test.${local.cloudflare_zone}"
        origin   = "http://api:8000"
      }
      docs = {
        hostname = "docs-test.${local.cloudflare_zone}"
        origin   = "http://docs:8000"
      }
    }
  }

  edge_routes = local.edge_routes_by_environment[var.environment]
  tunnel_name = "relab-${var.environment}"

  high_risk_country_set = "{${join(" ", formatlist("\"%s\"", ["RU", "CN", "BR"]))}}"

  # The zone-global rulesets are owned by a single workspace (see
  # manage_shared_zone_rulesets), so their rules match BOTH environments' api hosts
  # rather than only the current workspace's host — otherwise applying one env would
  # leave the other env's api with no rate limits / firewall rules.
  api_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    local.edge_routes_by_environment.prod.api.hostname,
    local.edge_routes_by_environment.staging.api.hostname,
  ]))}}"

  staging_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    for route in values(local.edge_routes_by_environment.staging) : route.hostname
  ]))}}"

  rate_limit_rules = {
    auth = {
      description         = "Rate limit authentication endpoints"
      expression          = "${local.api_hosts_expression} and starts_with(http.request.uri.path, \"/v1/auth/\")"
      period              = 60
      requests_per_period = 30
      mitigation_timeout  = 300
    }

    media_uploads = {
      description = "Rate limit product and component media upload endpoints"
      expression = join(" and ", [
        local.api_hosts_expression,
        "http.request.method in {\"POST\" \"PUT\" \"PATCH\"}",
        "(http.request.uri.path matches \"^/v1/products/[^/]+/(files|images)$\" or http.request.uri.path matches \"^/v1/components/[^/]+/(files|images)$\")",
      ])
      period              = 60
      requests_per_period = 60
      mitigation_timeout  = 300
    }

    rpi_cam_uploads = {
      description = "Rate limit Raspberry Pi camera upload endpoints"
      expression = join(" and ", [
        local.api_hosts_expression,
        "http.request.method in {\"POST\" \"PUT\" \"PATCH\"}",
        "(http.request.uri.path matches \"^/v1/plugins/rpi-cam/device/cameras/[^/]+/(image-upload|preview-thumbnail-upload)$\")",
      ])
      period              = 60
      requests_per_period = 120
      mitigation_timeout  = 300
    }

    rpi_cam_websocket = {
      description         = "Rate limit Raspberry Pi camera WebSocket connection endpoint"
      expression          = "${local.api_hosts_expression} and http.request.uri.path eq \"/v1/plugins/rpi-cam/ws/connect\""
      period              = 60
      requests_per_period = 30
      mitigation_timeout  = 300
    }
  }

  custom_firewall_rules = [
    {
      # RPi camera devices are non-browser IoT clients that Super Bot Fight Mode and
      # some managed WAF rules would challenge/block (they can't solve a JS/CAPTCHA
      # challenge). These endpoints are authenticated at the app layer by ES256 device
      # assertions (Redis replay protection) and covered by the rpi_cam_* rate limits
      # above, so the managed-security skip is intentional and scoped to just them.
      ref         = "relab_rpi_cam_device_skip_managed_security"
      description = "Skip managed WAF and Super Bot Fight Mode for RPi camera device traffic (both environments)"
      expression = join(" and ", [
        local.api_hosts_expression,
        "(${join(" or ", [
          "(http.request.method eq \"POST\" and http.request.uri.path eq \"/v1/plugins/rpi-cam/pairing/register\")",
          "(http.request.method eq \"GET\" and http.request.uri.path eq \"/v1/plugins/rpi-cam/pairing/poll\")",
          "http.request.uri.path eq \"/v1/plugins/rpi-cam/ws/connect\"",
          "(http.request.method eq \"POST\" and http.request.uri.path matches \"^/v1/plugins/rpi-cam/device/cameras/[^/]+/(image-upload|preview-thumbnail-upload)$\")",
        ])})",
      ])
      action = "skip"
      action_parameters = {
        phases = [
          "http_request_firewall_managed",
          "http_request_sbfm",
        ]
      }
    },
    {
      ref         = "relab_stats_skip_bot_fight_mode"
      description = "Skip Super Bot Fight Mode for public read-only stats endpoints"
      expression = join(" and ", [
        local.api_hosts_expression,
        "http.request.method eq \"GET\"",
        "starts_with(http.request.uri.path, \"/v1/stats/\")",
      ])
      action = "skip"
      action_parameters = {
        phases = [
          "http_request_sbfm",
        ]
      }
    },
    {
      ref         = "relab_high_risk_country_auth_challenge"
      description = "Managed challenge for authentication calls from high-risk countries"
      expression = join(" and ", [
        local.api_hosts_expression,
        "starts_with(http.request.uri.path, \"/v1/auth/\")",
        "ip.src.country in ${local.high_risk_country_set}",
      ])
      action = "managed_challenge"
    },
    {
      ref         = "relab_high_risk_country_admin_block"
      description = "Block admin calls from high-risk countries"
      expression = join(" and ", [
        local.api_hosts_expression,
        "starts_with(http.request.uri.path, \"/v1/admin/\")",
        "ip.src.country in ${local.high_risk_country_set}",
      ])
      action = "block"
    },
  ]
}
