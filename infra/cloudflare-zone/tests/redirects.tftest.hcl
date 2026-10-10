# Plan-only tests for the old zone's redirect ruleset. The provider is mocked, so these
# need no Cloudflare credentials and make no API calls.

mock_provider "cloudflare" {
  override_data {
    target = data.cloudflare_zone.this
    values = {
      name = "cml-relab.org"
    }
  }
}

variables {
  cloudflare_zone_id    = "11111111111111111111111111111111"
  cloudflare_zone_name  = "cml-relab.org"
  redirect_to_zone_name = "r9lab.io"
}

run "redirects_every_route" {
  command = plan

  variables {
    redirect_environments = ["prod", "staging"]
  }

  assert {
    condition     = length(cloudflare_ruleset.redirects[0].rules) == 8
    error_message = "expected one redirect rule per route in both environments."
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.redirects[0].rules :
      startswith(rule.action_parameters.from_value.target_url.expression, "concat(\"https://") &&
      (strcontains(rule.action_parameters.from_value.target_url.expression, ".r9lab.io\"") ||
      strcontains(rule.action_parameters.from_value.target_url.expression, "\"https://r9lab.io\""))
    ])
    error_message = "a redirect target is not on the new zone."
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.redirects[0].rules :
      rule.action_parameters.from_value.preserve_query_string
    ])
    error_message = "redirects must keep the query string."
  }
}

run "each_rule_targets_its_own_host" {
  command = plan

  variables {
    redirect_environments = ["prod", "staging"]
  }

  # Literal pairs on purpose: a target built the same way as the rule would repeat its bugs.
  assert {
    condition = {
      for rule in cloudflare_ruleset.redirects[0].rules :
      rule.expression => rule.action_parameters.from_value.target_url.expression
      } == {
      for old, new in {
        "cml-relab.org"           = "https://r9lab.io"
        "app.cml-relab.org"       = "https://app.r9lab.io"
        "api.cml-relab.org"       = "https://api.r9lab.io"
        "docs.cml-relab.org"      = "https://docs.r9lab.io"
        "web-test.cml-relab.org"  = "https://web-test.r9lab.io"
        "app-test.cml-relab.org"  = "https://app-test.r9lab.io"
        "api-test.cml-relab.org"  = "https://api-test.r9lab.io"
        "docs-test.cml-relab.org" = "https://docs-test.r9lab.io"
      } : "http.host eq \"${old}\"" => "concat(\"${new}\", http.request.uri.path)"
    }
    error_message = "each old host must redirect to the same prefix on the new zone."
  }

  assert {
    condition = {
      for rule in cloudflare_ruleset.redirects[0].rules :
      rule.expression => rule.action_parameters.from_value.status_code
      } == {
      for old, status in {
        "cml-relab.org"           = 302
        "app.cml-relab.org"       = 302
        "api.cml-relab.org"       = 307
        "docs.cml-relab.org"      = 302
        "web-test.cml-relab.org"  = 302
        "app-test.cml-relab.org"  = 302
        "api-test.cml-relab.org"  = 307
        "docs-test.cml-relab.org" = 302
      } : "http.host eq \"${old}\"" => status
    }
    error_message = "api redirects must be 307 and the rest 302 while temporary."
  }
}

run "permanent_redirects" {
  command = plan

  variables {
    redirect_environments = ["prod", "staging"]
    redirect_permanent    = true
  }

  assert {
    condition = {
      for rule in cloudflare_ruleset.redirects[0].rules :
      rule.expression => rule.action_parameters.from_value.status_code
      } == {
      for old, status in {
        "cml-relab.org"           = 301
        "app.cml-relab.org"       = 301
        "api.cml-relab.org"       = 308
        "docs.cml-relab.org"      = 301
        "web-test.cml-relab.org"  = 301
        "app-test.cml-relab.org"  = 301
        "api-test.cml-relab.org"  = 308
        "docs-test.cml-relab.org" = 301
      } : "http.host eq \"${old}\"" => status
    }
    error_message = "api redirects must be 308 and the rest 301 once permanent."
  }
}

run "no_redirects_by_default" {
  command = plan

  variables {
    redirect_to_zone_name = ""
  }

  assert {
    condition     = length(cloudflare_ruleset.redirects) == 0
    error_message = "a zone must not redirect unless redirect_to_zone_name is set."
  }
}

run "target_zone_differs" {
  command = plan

  variables {
    redirect_to_zone_name = "cml-relab.org"
    redirect_environments = ["prod", "staging"]
  }

  expect_failures = [var.redirect_to_zone_name]
}

run "staging_cutover_leaves_prod" {
  command = plan

  variables {
    redirect_environments = ["staging"]
  }

  assert {
    condition     = length(cloudflare_ruleset.redirects[0].rules) == 4
    error_message = "expected one redirect rule per staging route only."
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.redirects[0].rules :
      !contains([for route in values(local.edge_routes_by_environment.prod) : "http.host eq \"${route.hostname}\""], rule.expression)
    ])
    error_message = "a staging-only cutover must not redirect a prod host."
  }
}

run "redirect_environments_known" {
  command = plan

  variables {
    redirect_environments = ["stagign"]
  }

  expect_failures = [var.redirect_environments]
}

# A staging cutover must never redirect prod because the environment list was left out.
run "redirect_environments_required" {
  command = plan

  expect_failures = [var.redirect_environments]
}
