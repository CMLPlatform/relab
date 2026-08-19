# Zone-global locals: the rule expressions below deliberately match BOTH environments'
# hosts, because these rulesets are zone entrypoints that protect the whole zone.
locals {
  high_risk_country_set = "{${join(" ", formatlist("\"%s\"", ["RU", "CN", "BR"]))}}"

  # These rules match BOTH environments' api hosts. Cloudflare allows exactly one
  # entrypoint ruleset per (zone, phase), so there is one set of rules for the whole
  # zone and it has to protect prod and staging alike.
  api_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    local.edge_routes_by_environment.prod.api.hostname,
    local.edge_routes_by_environment.staging.api.hostname,
  ]))}}"

  staging_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    for route in values(local.edge_routes_by_environment.staging) : route.hostname
  ]))}}"

  # Ported from the live zone (rule "Bypass: SPA and web HTML entry points"). The web
  # and app origins serve single-page-app HTML whose URL does not change between
  # deploys, so an edge-cached entry point keeps serving the previous build. Prod only:
  # every staging host is bypassed wholesale by staging_hosts_expression.
  prod_html_bypass_expression = join(" and ", [
    "(http.host in {${join(" ", formatlist("\"%s\"", [
      local.edge_routes_by_environment.prod.www.hostname,
      local.edge_routes_by_environment.prod.app.hostname,
    ]))}})",
    "(http.request.uri.path.extension eq \"html\" or http.request.uri.path eq \"/\")",
  ])

  # The telemetry ingress host, owned by CMLPlatform/monitoring rather than by either
  # Relab environment, so it appears nowhere in the route map. That repo's infra/main.tf
  # publishes exactly two records in this zone — `grafana.` and `otlp.` — and fronts
  # Grafana with Cloudflare Access while leaving OTLP to the collector's own bearer
  # token. This rule keeps Cloudflare's bot products off that token-authenticated path.
  #
  # `logs.` was in the rule when it was adopted and is dropped here: the monitoring stack
  # publishes no such record, because Loki has no authentication of its own.
  telemetry_ingress_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    "otlp.${local.cloudflare_zone}",
  ]))}}"

  # Stored media is content-addressed: the filename embeds the file's hash, so a changed
  # image is a new URL and a cached copy can never go stale. Prod's api host only —
  # staging bypasses cache entirely (staging_hosts_expression above), and scoping this
  # rule away from it keeps the two from fighting over the same setting.
  uploads_expression = join(" and ", [
    "http.host eq \"${local.edge_routes_by_environment.prod.api.hostname}\"",
    "starts_with(http.request.uri.path, \"/uploads/\")",
  ])

  # Shaped entirely by what this zone's Cloudflare plan is entitled to. The Free tier
  # allows ONE rule in the http_ratelimit phase, a counting period of 10s, a mitigation
  # timeout of 10s, and only Path and Verified Bot as expression fields — notably NOT
  # http.host. Each of those was learned from an apply being refused; the tests now
  # assert them so the next edit fails in `just cloudflare-check` instead.
  #
  # The single slot goes to auth: those endpoints are reachable unauthenticated and are
  # the classic credential-stuffing target, and blocking at the edge keeps the flood off
  # the origin. Media uploads need a session and are bounded by the per-user upload
  # ledger; the RPi pairing, image and websocket routes carry their own limiter
  # dependencies (app/api/common/rate_limiting.py). None of them is left with no limit.
  #
  # 10 requests / 10s is deliberately far looser than the application limits it sits in
  # front of (login is 3/min, register and reset 3-5/hour — app/api/auth/config.py). The
  # backend does the precise per-endpoint enforcement; this rule only stops volume, and
  # sitting well above those numbers keeps it from ever being the thing that blocks a
  # real person. A false positive clears in 10s regardless.
  #
  # No host filter, because http.host cannot be used on this plan. In practice the path
  # is the scope: /v1/auth/ is only served by the api hostnames.
  rate_limit_rules = {
    auth = {
      description         = "Rate limit authentication endpoints"
      expression          = "starts_with(http.request.uri.path, \"/v1/auth/\")"
      period              = 10
      requests_per_period = 10
      mitigation_timeout  = 10
    }
  }

  # Ported from the live zone (rule "require-auth-on-telemetry-ingress"). A log shipper
  # is a non-browser client: Cloudflare's bot and managed-security products challenge it,
  # and a challenged log push is a silently dropped log. The shared credential is what
  # separates the real shipper from anyone else who finds the hostname, so it is a
  # variable rather than a literal — and the rule disappears when it is not supplied,
  # rather than degrading into "skip security for anyone hitting this host".
  telemetry_ingress_rules = var.telemetry_ingress_authorization == "" ? [] : [
    {
      ref         = "relab_telemetry_ingress_skip_managed_security"
      description = "Skip managed WAF and bot products for authenticated telemetry ingress"
      expression = join(" and ", [
        local.telemetry_ingress_hosts_expression,
        "any(http.request.headers[\"authorization\"][*] eq \"${var.telemetry_ingress_authorization}\")",
      ])
      action = "skip"
      action_parameters = {
        phases = [
          "http_request_firewall_managed",
          "http_request_sbfm",
        ]
        products = [
          "zoneLockdown",
          "uaBlock",
          "bic",
          "securityLevel",
        ]
      }
    },
  ]

  # Two rules present in the live zone are deliberately NOT ported:
  #
  #   "allow-traffic-from-api" — skipped security for rpi-cam-*.cml-relab.org behind a
  #   bypass header. No such hostname is served by either environment and nothing in the
  #   repo sends that header; the RPi cameras reach the API on api[-test]. directly.
  #
  #   "Cache default file extensions" — restated Cloudflare's own default extension
  #   caching. relab_uploads_cache covers the media that actually matters, and the
  #   origins already send Cache-Control for the rest.
  custom_firewall_rules = concat(local.telemetry_ingress_rules, [
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
          "(http.request.method eq \"POST\" and http.request.uri.path eq \"/v1/plugins/rpi-cam/pairing/poll\")",
          "http.request.uri.path eq \"/v1/plugins/rpi-cam/ws/connect\"",
          "(${join(" and ", [
            "http.request.method eq \"POST\"",
            "starts_with(http.request.uri.path, \"/v1/plugins/rpi-cam/device/cameras/\")",
            "(${join(" or ", [
              "ends_with(http.request.uri.path, \"/image-upload\")",
              "ends_with(http.request.uri.path, \"/preview-thumbnail-upload\")",
            ])})",
          ])})",
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
  ])
}
