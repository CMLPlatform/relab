# Plan-only tests for the zone-global Cloudflare configuration. The provider is
# mocked, so these need no Cloudflare credentials and make no API calls.

mock_provider "cloudflare" {}

variables {
  cloudflare_zone_id = "11111111111111111111111111111111"
}

run "rulesets_cover_every_environment" {
  command = plan

  # Both optional rules on: the RPi rule carries the staging-only e2e branch, and its
  # expression must still name both api hosts.
  variables {
    telemetry_edge_key = "test-edge-key"
    e2e_edge_key       = "test-e2e-key"
  }

  # These rulesets protect staging's api host as well as prod's, so every rule in them
  # must match both hosts.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref == "relab_telemetry_ingress_skip_managed_security" ||
      (strcontains(rule.expression, "\"api.cml-relab.org\"") && strcontains(rule.expression, "\"api-test.cml-relab.org\""))
    ])
    error_message = "a custom firewall rule does not match both environments' api hosts, leaving one env unprotected."
  }

  # Cache rules must stay disjoint by host: media caching is prod's api host only, and
  # staging bypasses cache wholesale.
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

  # The SPA entry-point URL does not change between deploys, so a cached copy keeps
  # serving the previous build.
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

  # Without the credential the rule must disappear, not skip managed security for anyone
  # who finds the telemetry hostname.
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

  # The collector's Authorization bearer token must never appear in a ruleset expression,
  # which Cloudflare stores in cleartext.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      !strcontains(rule.expression, "authorization")
    ])
    error_message = "no firewall expression may match (and thereby store) the Authorization header value."
  }

  # A skip rule that also matched the API would be a way past the WAF.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref != "relab_telemetry_ingress_skip_managed_security" ||
      !strcontains(rule.expression, "api.cml-relab.org")
    ])
    error_message = "the telemetry skip rule must not match the api hosts."
  }
}

run "e2e_branch_is_absent_without_its_credential" {
  command = plan

  # Without the key nothing may match the header, or anyone who finds a staging hostname
  # gets the managed-security skip.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      !strcontains(rule.expression, "x-e2e-key")
    ])
    error_message = "no rule may match the e2e header when no credential is configured."
  }
}

run "e2e_branch_is_scoped_to_staging_and_its_credential" {
  command = plan

  variables {
    e2e_edge_key = "test-e2e-key"
  }

  # Folded into the RPi rule: the Free plan's five-rule budget for this phase is full.
  assert {
    condition = anytrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref == "relab_rpi_cam_device_skip_managed_security" &&
      strcontains(rule.expression, "x-e2e-key") &&
      strcontains(rule.expression, "api-test.cml-relab.org")
    ])
    error_message = "the e2e branch must match the staging hosts AND the credential header."
  }

  # The header alone must never be enough: a prod host with the key must not match. The
  # branch is joined by "and" to the staging host set, so assert that pairing survives.
  assert {
    condition = anytrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      strcontains(rule.expression, "${local.staging_hosts_expression} and any(http.request.headers[\"x-e2e-key\"][*] eq \"test-e2e-key\")")
    ])
    error_message = "the e2e header match must be conjoined with the staging host set, never stand alone."
  }
}

run "public_reads_skip_bot_fight_mode" {
  command = plan

  # Stats and the www build's product/component-tree fetches are non-browser clients; a
  # challenge there ships the landing page's fixture instead of real data.
  assert {
    condition = anytrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref == "relab_public_reads_skip_bot_fight_mode" &&
      strcontains(rule.expression, "/v1/stats/") &&
      strcontains(rule.expression, "/v1/products/") &&
      strcontains(rule.expression, "http.request.method eq \"GET\"")
    ])
    error_message = "public stats and product reads must skip Super Bot Fight Mode on GET."
  }

  # CORS preflights: a challenged OPTIONS blocks every cross-origin call from the app.
  assert {
    condition = anytrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref == "relab_public_reads_skip_bot_fight_mode" &&
      strcontains(rule.expression, "http.request.method eq \"OPTIONS\"")
    ])
    error_message = "CORS preflights (OPTIONS) must skip Super Bot Fight Mode on the api hosts."
  }

  # Writes must stay behind the bot products: no POST/PUT/PATCH/DELETE in the expression.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall.rules :
      rule.ref != "relab_public_reads_skip_bot_fight_mode" ||
      (rule.action_parameters.phases == tolist(["http_request_sbfm"]) &&
        !strcontains(rule.expression, "\"POST\"") &&
        !strcontains(rule.expression, "\"PATCH\"") &&
        !strcontains(rule.expression, "\"PUT\"") &&
      !strcontains(rule.expression, "\"DELETE\""))
    ])
    error_message = "the public read rule must skip Super Bot Fight Mode only, and never for writes."
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
    e2e_edge_key       = "test-e2e-key"
  }

  # The `matches` (regex) operator needs a Business or WAF Advanced plan. Using it fails
  # at apply time with "not entitled", after earlier resources have already changed.
  assert {
    condition = alltrue(concat(
      [for rule in cloudflare_ruleset.custom_firewall.rules : !strcontains(rule.expression, " matches ")],
      [for rule in cloudflare_ruleset.cache_settings.rules : !strcontains(rule.expression, " matches ")],
      [for rule in cloudflare_ruleset.rate_limiting.rules : !strcontains(rule.expression, " matches ")],
    ))
    error_message = "an expression uses the `matches` operator, which this zone's Cloudflare plan is not entitled to."
  }

  # The Free plan allows five rules in the http_request_firewall_custom phase. The sixth
  # is refused at apply time, after earlier resources have already changed. Both optional
  # rules are set in this run, so this counts the maximum the configuration can produce.
  assert {
    condition     = length(cloudflare_ruleset.custom_firewall.rules) <= 5
    error_message = "the http_request_firewall_custom phase allows only five rules on this zone's Free plan; fold the condition into an existing rule."
  }

  # Free-tier limits, all refused at apply time: one rule in the phase, a 10s counting
  # period, a 10s mitigation timeout, and no http.host in the expression (Path and
  # Verified Bot are the only fields allowed).
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

  # The rule has no host filter, so its path must target /v1/auth/, which nothing else
  # serves.
  assert {
    condition     = strcontains(cloudflare_ruleset.rate_limiting.rules[0].expression, "/v1/auth/")
    error_message = "the rate-limit rule must target the auth endpoints."
  }

  # The single available slot holds the auth rule, the only edge protection on the
  # unauthenticated routes.
  assert {
    condition     = cloudflare_ruleset.rate_limiting.rules[0].ref == "relab_auth"
    error_message = "the single rate-limit rule must be the auth one."
  }
}
