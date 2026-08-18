# Plan-only tests for the Relab Cloudflare edge. The provider is mocked, so these
# need no Cloudflare credentials and make no API calls: run them with `tofu test`
# (wired into `just cloudflare-check`).

mock_provider "cloudflare" {}

variables {
  cloudflare_account_id = "00000000000000000000000000000000"
  cloudflare_zone_id    = "11111111111111111111111111111111"
}

run "staging_does_not_own_the_shared_zone_rulesets" {
  command = plan

  variables {
    environment                 = "staging"
    manage_shared_zone_rulesets = false
  }

  assert {
    condition     = length(cloudflare_ruleset.rate_limiting) == 0 && length(cloudflare_ruleset.cache_settings) == 0 && length(cloudflare_ruleset.custom_firewall) == 0
    error_message = "staging must not manage the zone-global rulesets; applying it would clobber the entrypoint rulesets prod owns."
  }

  assert {
    condition     = alltrue([for hostname in output.hostnames : endswith(hostname, "-test.cml-relab.org")])
    error_message = "every staging hostname must be a -test subdomain."
  }
}

run "prod_rulesets_cover_both_environments" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition     = length(cloudflare_ruleset.rate_limiting) == 1 && length(cloudflare_ruleset.cache_settings) == 1 && length(cloudflare_ruleset.custom_firewall) == 1
    error_message = "prod owns the zone-global rulesets by default."
  }

  # The shared rulesets are the only ones protecting staging's api host too, so every
  # rule in them must match both hosts, not just prod's.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.rate_limiting[0].rules :
      strcontains(rule.expression, "\"api.cml-relab.org\"") && strcontains(rule.expression, "\"api-test.cml-relab.org\"")
    ])
    error_message = "a rate-limit rule does not match both environments' api hosts, leaving one env unprotected."
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.custom_firewall[0].rules :
      strcontains(rule.expression, "\"api.cml-relab.org\"") && strcontains(rule.expression, "\"api-test.cml-relab.org\"")
    ])
    error_message = "a custom firewall rule does not match both environments' api hosts, leaving one env unprotected."
  }

  assert {
    condition     = contains(output.hostnames, "cml-relab.org")
    error_message = "prod must serve the apex hostname."
  }

  # The cache rules are the one place where two rules could set the same thing on
  # the same request. They stay disjoint by host: media caching is prod's api host
  # only, and staging bypasses cache wholesale.
  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.cache_settings[0].rules :
      rule.ref == "relab_staging_cache_bypass" || !strcontains(rule.expression, "-test.cml-relab.org")
    ])
    error_message = "a cache rule matches a staging host, which would contend with the staging bypass."
  }
}

run "tunnel_ingress_ends_in_a_catch_all" {
  command = plan

  variables {
    environment = "prod"
  }

  # Cloudflare requires a terminal rule; if it stops being last, unknown hostnames
  # start reaching whichever origin follows it.
  assert {
    condition     = reverse(cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress)[0].service == "http_status:404"
    error_message = "the last tunnel ingress rule must be the http_status:404 catch-all."
  }
}

run "rejects_an_unknown_environment" {
  command = plan

  variables {
    environment = "dev"
  }

  expect_failures = [var.environment]
}
