# Plan-only tests for the zone-global Cloudflare configuration. The provider is
# mocked, so these need no Cloudflare credentials and make no API calls.

mock_provider "cloudflare" {}

variables {
  cloudflare_zone_id = "11111111111111111111111111111111"
}

run "rulesets_cover_every_environment" {
  command = plan

  # These rulesets are the only ones protecting staging's api host as well as prod's,
  # so every rule in them must match both hosts, not just one.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      strcontains(rule.expression, "\"api.cml-relab.org\"") && strcontains(rule.expression, "\"api-test.cml-relab.org\"")
    ])
    error_message = "a custom firewall rule does not match both environments' api hosts, leaving one env unprotected."
  }

  # The cache rules are the one place where two rules could set the same thing on the
  # same request. They stay disjoint by host: media caching is prod's api host only,
  # and staging bypasses cache wholesale.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.cache_settings.rules :
      rule.ref == "relab_staging_cache_bypass" || !strcontains(rule.expression, "-test.cml-relab.org")
    ])
    error_message = "a cache rule matches a staging host, which would contend with the staging bypass."
  }

  assert {
    condition     = length(output.protected_api_hosts) == 2
    error_message = "every environment's api host must be covered by the zone rulesets."
  }
}

run "tls_floor_is_modern" {
  command = plan

  assert {
    condition     = cloudflare_zone_setting.minimum_tls_version.value == "1.2"
    error_message = "the zone must not accept TLS below 1.2."
  }
}

run "prod_html_entry_points_bypass_cache" {
  command = plan

  # Ported from a rule that existed in the live zone. The SPA entry-point URL does not
  # change between deploys, so a cached one keeps serving the previous build.
  assert {
    condition = anytrue([
      for rule in cloudflare_ruleset.cache_settings.rules :
      rule.ref == "relab_prod_html_bypass" && rule.action_parameters.cache == false
    ])
    error_message = "prod HTML entry points must bypass the edge cache."
  }

  # The apex and app hosts, not the api host: /uploads/ media must stay cacheable.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.cache_settings.rules :
      rule.ref != "relab_prod_html_bypass" || !strcontains(rule.expression, "api.cml-relab.org")
    ])
    error_message = "the HTML bypass must not match the api host, which serves cacheable media."
  }
}

run "telemetry_rule_is_omitted_without_its_credential" {
  command = plan

  # Failing open here would mean skipping managed security for anyone who finds the
  # telemetry hostname, so absence of the credential must drop the rule entirely.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref != "relab_telemetry_ingress_skip_managed_security"
    ])
    error_message = "the telemetry skip rule must not exist when no credential is configured."
  }
}

run "telemetry_rule_is_scoped_to_its_hosts_and_credential" {
  command = plan

  variables {
    telemetry_edge_key = "test-edge-key"
  }

  assert {
    condition = anytrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref == "relab_telemetry_ingress_skip_managed_security" &&
      strcontains(rule.expression, "otel.cml-relab.org") &&
      strcontains(rule.expression, "x-telemetry-key")
    ])
    error_message = "the telemetry skip rule must match the ingress host AND the credential header."
  }

  # The whole point of the dedicated header: the collector's Authorization bearer
  # token must never be readable from a ruleset expression.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      !strcontains(rule.expression, "authorization")
    ])
    error_message = "no firewall expression may match (and thereby store) the Authorization header value."
  }

  # A skip rule that also matched the API would hand an attacker a way past the WAF.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref != "relab_telemetry_ingress_skip_managed_security" ||
      !strcontains(rule.expression, "api.cml-relab.org")
    ])
    error_message = "the telemetry skip rule must not match the api hosts."
  }
}

run "entrypoint_rulesets_keep_the_default_name" {
  command = plan

  # Renaming an existing entrypoint forces replacement, and replacing the firewall
  # entrypoint means a window with no custom firewall rules at all.
  assert {
    condition = alltrue([
      cloudflare_ruleset.rate_limiting.name == "default",
      cloudflare_ruleset.cache_settings.name == "default",
      cloudflare_ruleset.custom_firewall.name == "default",
    ])
    error_message = "zone entrypoint rulesets must be named 'default' or adoption becomes a destroy/recreate."
  }
}

run "expressions_stay_inside_the_zone_plan_entitlements" {
  command = plan

  variables {
    telemetry_edge_key = "test-edge-key"
  }

  # The `matches` (regex) operator needs a Business or WAF Advanced plan. Using it
  # fails at APPLY time with "not entitled", after earlier resources have already
  # changed — so catch it here, where it costs nothing.
  assert {
    condition = alltrue(concat(
      [for rule in cloudflare_ruleset.custom_firewall.rules : !strcontains(rule.expression, " matches ")],
      [for rule in cloudflare_ruleset.cache_settings.rules : !strcontains(rule.expression, " matches ")],
      [for rule in cloudflare_ruleset.rate_limiting.rules : !strcontains(rule.expression, " matches ")],
    ))
    error_message = "an expression uses the `matches` operator, which this zone's Cloudflare plan is not entitled to."
  }

  # Same class of failure, all refused at apply time by the Free tier: one rule in the
  # phase, a 10s counting period, a 10s mitigation timeout, and no http.host in the
  # expression (Path and Verified Bot are the only fields allowed).
  assert {
    condition     = length(cloudflare_ruleset.rate_limiting.rules) <= 1
    error_message = "the http_ratelimit phase allows only one rule on this zone's plan."
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.rate_limiting.rules :
      rule.ratelimit.period == 10 && rule.ratelimit.mitigation_timeout == 10
    ])
    error_message = "this zone's plan allows only a 10s counting period and a 10s mitigation timeout."
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.rate_limiting.rules :
      !strcontains(rule.expression, "http.host")
    ])
    error_message = "http.host is not an allowed rate-limit expression field on this zone's plan; scope by path."
  }

  # Path-only scoping is safe precisely because /v1/auth/ is served by nothing else, so
  # the rule must still actually target it.
  assert {
    condition     = strcontains(cloudflare_ruleset.rate_limiting.rules[0].expression, "/v1/auth/")
    error_message = "the rate-limit rule must target the auth endpoints."
  }

  # The one slot must be the auth rule; losing it to a lower-value endpoint is a
  # silent downgrade of the only edge protection on unauthenticated routes.
  assert {
    condition     = cloudflare_ruleset.rate_limiting.rules[0].ref == "relab_auth"
    error_message = "the single rate-limit rule must be the auth one."
  }
}
