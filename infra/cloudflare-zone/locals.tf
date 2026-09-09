# Zone-global locals. Cloudflare allows one entrypoint ruleset per (zone, phase), so
# these expressions cover both environments' hosts.
locals {
  high_risk_country_set = "{${join(" ", formatlist("\"%s\"", ["RU", "CN", "BR"]))}}"

  api_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    local.edge_routes_by_environment.prod.api.hostname,
    local.edge_routes_by_environment.staging.api.hostname,
  ]))}}"

  staging_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    for route in values(local.edge_routes_by_environment.staging) : route.hostname
  ]))}}"

  # The web and app origins serve SPA HTML whose URL does not change between deploys, so
  # an edge-cached entry point keeps serving the previous build. Prod hosts only; every
  # staging host is bypassed by staging_hosts_expression.
  prod_html_bypass_expression = join(" and ", [
    "(http.host in {${join(" ", formatlist("\"%s\"", [
      local.edge_routes_by_environment.prod.www.hostname,
      local.edge_routes_by_environment.prod.app.hostname,
    ]))}})",
    "(http.request.uri.path.extension eq \"html\" or http.request.uri.path eq \"/\")",
  ])

  # The telemetry ingress host is owned by CMLPlatform/monitoring, not by either Relab
  # environment, so it is absent from the route map. That repo publishes `grafana.` and
  # `otel.` in this zone. The ingestion host was renamed from `otlp.` to `otel.` on
  # 2026-09-05; this expression must track the name or the skip stops matching.
  telemetry_ingress_hosts_expression = "http.host in {${join(" ", formatlist("\"%s\"", [
    "otel.${local.cloudflare_zone}",
  ]))}}"

  # Stored media is content-addressed: the filename embeds the file's hash, so a changed
  # image is a new URL and a cached copy cannot go stale. Prod's api host only; staging
  # bypasses cache through staging_hosts_expression.
  uploads_expression = join(" and ", [
    "http.host eq \"${local.edge_routes_by_environment.prod.api.hostname}\"",
    "starts_with(http.request.uri.path, \"/uploads/\")",
  ])

  # Free-tier limits on the http_ratelimit phase: one rule, a 10s counting period, a 10s
  # mitigation timeout, and only Path and Verified Bot as expression fields. http.host is
  # not available, so the path is the scope; /v1/auth/ is served only by the api
  # hostnames. The tests assert these limits, so an unsupported edit fails in
  # `just cloudflare-check` instead of at apply time. 10 requests per 10s is far above
  # the per-endpoint limits in backend/app/api/auth/config.py: the edge stops volume,
  # the backend enforces per endpoint.
  rate_limit_rules = {
    auth = {
      description         = "Rate limit authentication endpoints"
      expression          = "starts_with(http.request.uri.path, \"/v1/auth/\")"
      period              = 10
      requests_per_period = 10
      mitigation_timeout  = 10
    }
  }

  # A log shipper is a non-browser client, so Cloudflare's bot and managed-security
  # products challenge it, and a challenged log push is a dropped log. The rule is absent
  # when var.telemetry_edge_key is empty, so the skip never applies without a credential.
  #
  # The expression matches a dedicated header, never the Authorization bearer token:
  # Cloudflare stores and serves ruleset expressions in cleartext, so matching the token
  # would disclose the collector credential to any zone-read grant. jsonencode keeps a key
  # containing `"` or `\` from producing a malformed expression.
  telemetry_ingress_rules = var.telemetry_edge_key == "" ? [] : [
    {
      ref         = "relab_telemetry_ingress_skip_managed_security"
      description = "Skip managed WAF and bot products for authenticated telemetry ingress"
      expression = join(" and ", [
        local.telemetry_ingress_hosts_expression,
        # One apply lands on prod and staging at once. Renaming this header needs an
        # order: deploy both hosts first, then apply. In between, the hosts do not send
        # the name the rule expects and exports are bot-challenged: deploy every host on
        # the release that sends the new name, confirm telemetry arrives, then apply.
        "any(http.request.headers[\"x-telemetry-key\"][*] eq ${jsonencode(var.telemetry_edge_key)})",
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

  # Two rules that exist in the live zone are not ported here:
  # "allow-traffic-from-api" (no rpi-cam-* hostname is served and nothing sends its bypass
  # header) and "Cache default file extensions" (Cloudflare caches those by default).
  custom_firewall_rules = concat(local.telemetry_ingress_rules, [
    {
      # RPi cameras are non-browser IoT clients that cannot solve a JS or CAPTCHA
      # challenge, so Super Bot Fight Mode and some managed WAF rules block them. These
      # endpoints are authenticated at the app layer by ES256 device assertions with
      # Redis replay protection, and the skip is scoped to just those paths.
      #
      # This is the only rule that skips the managed WAF, so nothing but these four device
      # paths may join it. Keyed staging E2E lives in the SBFM-only rule below instead: it
      # is a header anyone holding the key can send, and the WAF is the control that has to
      # keep standing behind it.
      ref         = "relab_rpi_cam_device_skip_managed_security"
      description = "Skip managed WAF and Super Bot Fight Mode for RPi camera device traffic"
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
      # Public read-only data that non-browser clients legitimately fetch: the stats
      # widgets, and the www build, which reads a product and its component tree at build
      # time and ships its fixture instead when the fetch is challenged. One rule for both
      # because the Free plan allows five in this phase. This zone's plan has no `matches`
      # operator, so the prefix stands in for `^/v1/products/[0-9]+(/components/tree)?$`;
      # every GET under it is an unauthenticated read.
      #
      # Staging E2E rides along as the other two branches, not in the managed-WAF rule
      # above: the Free plan allows five rules in this phase and they are all spoken for,
      # so a rule of its own would fail at apply time. This rule skips only Super Bot Fight
      # Mode, so a keyed run still meets the same managed WAF prod does.
      #
      # The OPTIONS branch is one of those: a keyed run adds a custom header, so the
      # browser sends a CORS preflight before every request, and a preflight cannot carry
      # the key — the browser strips it. It is joined to the staging hosts, because a
      # preflight is a request the origin answers before routing and therefore before any
      # per-route limiter, and prod has no E2E run needing it.
      ref         = "relab_public_reads_skip_bot_fight_mode"
      description = "Skip Super Bot Fight Mode for public read-only endpoints and staging E2E runs"
      expression = join(" or ", concat([
        join(" and ", [
          local.api_hosts_expression,
          "http.request.method eq \"GET\"",
          "(${join(" or ", [
            "starts_with(http.request.uri.path, \"/v1/stats/\")",
            "starts_with(http.request.uri.path, \"/v1/products/\")",
          ])})",
        ]),
        join(" and ", [
          local.staging_hosts_expression,
          "http.request.method eq \"OPTIONS\"",
        ]),
        ], var.e2e_edge_key == "" ? [] : [
        # Cloudflare stores and serves ruleset expressions in cleartext, so this is a
        # dedicated key with no other use; jsonencode keeps one containing `"` or `\`
        # from producing a malformed expression.
        join(" and ", [
          local.staging_hosts_expression,
          "any(http.request.headers[\"x-e2e-key\"][*] eq ${jsonencode(var.e2e_edge_key)})",
        ]),
      ]))
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
