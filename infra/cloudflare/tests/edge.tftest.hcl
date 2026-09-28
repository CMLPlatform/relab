# Plan-only tests for the per-environment Relab Cloudflare edge (tunnel, DNS records,
# tunnel ingress). The provider is mocked, so these need no Cloudflare credentials and
# make no API calls: run them with `tofu test` (wired into `just cloudflare-check`).
#
# Zone-global resources are tested in ../cloudflare-zone/tests/zone.tftest.hcl.

mock_provider "cloudflare" {}
mock_provider "github" {
  mock_data "github_user" {
    defaults = {
      id = "4242"
    }
  }
}

variables {
  cloudflare_account_id    = "00000000000000000000000000000000"
  cloudflare_zone_id       = "11111111111111111111111111111111"
  github_staging_reviewers = ["staging-reviewer"]
}

run "staging_serves_only_test_subdomains" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = alltrue([for hostname in output.hostnames : endswith(hostname, "-test.cml-relab.org")])
    error_message = "every staging hostname must be a -test subdomain."
  }
}

run "prod_serves_the_apex" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition     = contains(output.hostnames, "cml-relab.org")
    error_message = "prod must serve the apex hostname."
  }
}

run "environments_never_share_a_hostname" {
  command = plan

  variables {
    environment = "prod"
  }

  # Both environments' tunnels are CNAME targets in the same zone, so an overlapping
  # hostname means two tunnels claiming one name.
  assert {
    condition = length(setintersection(
      toset([for route in values(local.edge_routes_by_environment.prod) : route.hostname]),
      toset([for route in values(local.edge_routes_by_environment.staging) : route.hostname]),
    )) == 0
    error_message = "prod and staging must not share a hostname."
  }
}

run "static_sites_leave_the_tunnel_for_workers" {
  command = plan

  variables {
    environment = "staging"
  }

  # A hostname with both a tunnel CNAME and a custom domain cannot exist: Cloudflare
  # refuses the domain. Each route is served one way.
  assert {
    condition     = length(setintersection(keys(cloudflare_dns_record.edge), keys(cloudflare_workers_custom_domain.site))) == 0
    error_message = "no hostname may have both a tunnel record and a Workers custom domain."
  }

  assert {
    condition     = cloudflare_workers_custom_domain.site["www"].service == github_actions_environment_variable.publish["WWW_WORKER"].value
    error_message = "the www custom domain must serve the Worker the site deploy targets."
  }

  assert {
    condition     = cloudflare_workers_custom_domain.site["docs"].hostname == "docs-test.cml-relab.org"
    error_message = "staging docs must be served by a Worker on its -test hostname."
  }

  assert {
    condition     = !contains([for rule in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress : rule.service], "http://www:8081")
    error_message = "the tunnel must no longer route to a www container."
  }
}

run "tunnel_ingress_ends_in_a_catch_all" {
  command = plan

  variables {
    environment = "prod"
  }

  # Cloudflare requires a terminal rule. If it stops being last, unknown hostnames reach
  # whichever origin follows it.
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

run "publish_urls_follow_the_hostnames" {
  command = plan

  variables {
    environment = "staging"
  }

  # The images bake these in; one drifting from the DNS record ships a site linking to
  # a host that does not answer.
  assert {
    condition = alltrue([
      for name, url in local.github_public_url_variables :
      contains([for hostname in output.hostnames : "https://${hostname}"], url)
    ])
    error_message = "every publish URL must be one of this environment's hostnames."
  }

  assert {
    condition     = github_actions_environment_variable.publish["SITE_PUBLIC_URL"].value == "https://web-test.cml-relab.org"
    error_message = "staging SITE_PUBLIC_URL must be the staging www hostname."
  }

  assert {
    condition     = length(github_repository_environment_deployment_policy.main) == 0
    error_message = "staging must accept a publish from any branch."
  }
}

run "prod_publishes_only_from_main" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition     = github_repository_environment_deployment_policy.main[0].branch_pattern == "main"
    error_message = "prod URLs must only be baked into images built from main."
  }
}

run "staging_waits_for_a_reviewer" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = github_repository_environment.publish.reviewers[0].users == toset([4242])
    error_message = "staging runs must wait for a required reviewer."
  }
}

run "staging_without_a_reviewer_is_refused" {
  command = plan

  variables {
    environment              = "staging"
    github_staging_reviewers = []
  }

  expect_failures = [github_repository_environment.publish]
}

run "prod_has_no_reviewer" {
  command = plan

  variables {
    environment              = "prod"
    github_staging_reviewers = []
  }

  assert {
    condition     = length(github_repository_environment.publish.reviewers) == 0
    error_message = "prod deploys from release.yml unattended; it must not wait for a reviewer."
  }
}
