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

run "api_keeps_method" {
  command = plan

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.redirects[0].rules :
      rule.action_parameters.from_value.status_code == (strcontains(rule.ref, "_api") ? 307 : 302)
    ])
    error_message = "api redirects must be 307 and the rest 302 while temporary."
  }
}

run "api_keeps_method_when_permanent" {
  command = plan

  variables {
    redirect_permanent = true
  }

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.redirects[0].rules :
      rule.action_parameters.from_value.status_code == (strcontains(rule.ref, "_api") ? 308 : 301)
    ])
    error_message = "api redirects must be 308 and the rest 301 once permanent."
  }
}

run "only_route_hosts_redirected" {
  command = plan

  assert {
    condition = alltrue([
      for rule in cloudflare_ruleset.redirects[0].rules :
      !strcontains(rule.expression, "otel.") && !strcontains(rule.expression, "grafana.") && !strcontains(rule.expression, "ssh-")
    ])
    error_message = "monitoring and SSH hosts must keep resolving in the old zone."
  }

  assert {
    condition = toset([
      for rule in cloudflare_ruleset.redirects[0].rules : rule.expression
      ]) == toset([
      for route in concat(values(local.edge_routes_by_environment.prod), values(local.edge_routes_by_environment.staging)) :
      "http.host eq \"${route.hostname}\""
    ])
    error_message = "redirect rules must match exactly the hosts in the route map."
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
  }

  expect_failures = [var.redirect_to_zone_name]
}
