# Plan-only tests for the per-environment Relab Cloudflare edge (tunnel, DNS records,
# tunnel ingress). The provider is mocked, so these need no Cloudflare credentials and
# make no API calls: run them with `tofu test` (wired into `just cloudflare-check`).
#
# Zone-global resources are tested in ../cloudflare-zone/tests/zone.tftest.hcl.

mock_provider "cloudflare" {}

variables {
  cloudflare_account_id = "00000000000000000000000000000000"
  cloudflare_zone_id    = "11111111111111111111111111111111"
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

  # Both environments' tunnels are CNAME targets in the same zone; an overlapping
  # hostname would mean two tunnels claiming one name.
  assert {
    condition = length(setintersection(
      toset([for route in values(local.edge_routes_by_environment.prod) : route.hostname]),
      toset([for route in values(local.edge_routes_by_environment.staging) : route.hostname]),
    )) == 0
    error_message = "prod and staging must not share a hostname."
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
