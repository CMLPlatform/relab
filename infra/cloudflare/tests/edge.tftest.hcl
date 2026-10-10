# Plan-only tests for the per-environment R9lab Cloudflare edge (tunnel, DNS records,
# tunnel ingress). The provider is mocked, so these need no Cloudflare credentials and
# make no API calls: run them with `tofu test` (wired into `just cloudflare-check`).
#
# Zone-global resources are tested in ../cloudflare-zone/tests/zone.tftest.hcl.

mock_provider "cloudflare" {
  override_data {
    target = data.cloudflare_zone.this
    values = {
      name = "r9lab.io"
    }
  }
}
mock_provider "github" {
  mock_data "github_user" {
    defaults = {
      id = "4242"
    }
  }
}

variables {
  cloudflare_account_id = "00000000000000000000000000000000"
  cloudflare_zone_id    = "11111111111111111111111111111111"
  github_reviewers      = ["reviewer"]
}

run "staging_serves_only_test_subdomains" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = alltrue([for hostname in output.hostnames : endswith(hostname, "-test.r9lab.io")])
    error_message = "every staging hostname must be a -test subdomain."
  }
}

run "prod_serves_the_apex" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition     = contains(output.hostnames, "r9lab.io")
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
    condition     = github_actions_environment_variable.publish["API_PUBLIC_URL"].value == "https://api-test.r9lab.io"
    error_message = "staging API_PUBLIC_URL must follow the zone."
  }

  assert {
    condition     = length(github_repository_environment_deployment_policy.main) == 0
    error_message = "staging must accept a publish from any branch."
  }

  assert {
    condition     = length(github_repository_ruleset.release_tags) == 0
    error_message = "the repository-wide release-tag ruleset belongs to the prod workspace only."
  }

  assert {
    condition     = github_repository_environment.publish.reviewers[0].users == toset([4242])
    error_message = "staging runs must wait for a required reviewer while its token is not scoped to its own Workers."
  }
}

run "prod_gates_publishes_and_release_tags" {
  command = plan

  variables {
    environment = "prod"
  }

  # These values are the release policy itself, so a change to them must fail here too.
  assert {
    condition     = github_repository_environment_deployment_policy.main[0].branch_pattern == "main"
    error_message = "prod URLs must only be baked into images built from main."
  }

  assert {
    condition     = github_actions_environment_variable.publish["API_PUBLIC_URL"].value == "https://api.r9lab.io"
    error_message = "prod API_PUBLIC_URL must follow the zone."
  }

  assert {
    condition     = github_repository_environment_deployment_policy.release_tag[0].tag_pattern == "v*"
    error_message = "release.yml runs on the release tag, so prod must accept v* tags."
  }

  # Hosts deploy images by tag, so a tag anyone with write access can move is a deploy
  # anyone with write access can trigger.
  assert {
    condition     = github_repository_ruleset.release_tags[0].conditions[0].ref_name[0].include == tolist(["refs/tags/v*"])
    error_message = "the release-tag ruleset must cover v* tags."
  }

  assert {
    condition = alltrue([
      github_repository_ruleset.release_tags[0].rules[0].creation,
      github_repository_ruleset.release_tags[0].rules[0].update,
      github_repository_ruleset.release_tags[0].rules[0].deletion,
    ])
    error_message = "v* tags must be restricted on create, update and delete."
  }

  assert {
    condition     = toset([for actor in github_repository_ruleset.release_tags[0].bypass_actors : actor.actor_id]) == toset([2, 5])
    error_message = "only maintainers and admins may bypass the release-tag ruleset."
  }

  # The reviewer is the release gate; the username must resolve to its user id.
  assert {
    condition     = github_repository_environment.publish.reviewers[0].users == toset([4242])
    error_message = "prod jobs must wait for the configured reviewer."
  }
}

run "an_environment_without_a_reviewer_is_refused" {
  command = plan

  variables {
    environment      = "prod"
    github_reviewers = []
  }

  expect_failures = [github_repository_environment.publish]
}

run "legacy_ingress_by_default" {
  command = plan

  variables {
    environment = "prod"
  }

  # A forgotten TF_VAR_legacy_zone_name during the move must not drop the old hosts.
  assert {
    condition     = contains([for rule in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress : coalesce(rule.hostname, "-")], "app.cml-relab.org")
    error_message = "the default ingress must keep the previous zone's hosts during the move."
  }

  # The old hostnames reach the tunnel until the old zone redirects, but only the ingress
  # knows about them.
  assert {
    condition = !anytrue([
      for rule in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress :
      contains(["cml-relab.org", "docs.cml-relab.org"], coalesce(rule.hostname, "-"))
    ])
    error_message = "only tunnel routes get legacy hostnames: not the apex or docs."
  }

  assert {
    condition = (
      [for r in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress : r.service if r.hostname == "api.cml-relab.org"]
      == [for r in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress : r.service if r.hostname == "api.r9lab.io"]
    )
    error_message = "a legacy hostname must reach the same origin as its new hostname."
  }

  assert {
    condition     = reverse(cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress)[0].service == "http_status:404"
    error_message = "the 404 catch-all must stay last with legacy hostnames present."
  }

  assert {
    condition     = !anytrue([for record in values(cloudflare_dns_record.edge) : endswith(record.name, "cml-relab.org")])
    error_message = "no DNS record may be created on the legacy zone."
  }

  assert {
    condition     = !anytrue([for domain in values(cloudflare_workers_custom_domain.site) : endswith(domain.hostname, "cml-relab.org")])
    error_message = "no custom domain may be created on the legacy zone."
  }
}

run "no_legacy_ingress_when_empty" {
  command = plan

  variables {
    environment      = "prod"
    legacy_zone_name = ""
  }

  assert {
    condition     = !anytrue([for rule in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress : endswith(coalesce(rule.hostname, "-"), "cml-relab.org")])
    error_message = "an empty legacy_zone_name must leave the old zone out of the ingress."
  }
}

run "legacy_ingress_covers_staging_hosts" {
  command = plan

  variables {
    environment      = "staging"
    legacy_zone_name = "cml-relab.org"
  }

  assert {
    condition     = contains([for rule in cloudflare_zero_trust_tunnel_cloudflared_config.relab.config.ingress : coalesce(rule.hostname, "-")], "app-test.cml-relab.org")
    error_message = "staging's legacy app host must stay in the ingress."
  }
}

run "legacy_zone_must_differ_from_the_zone" {
  command = plan

  variables {
    environment      = "prod"
    legacy_zone_name = "r9lab.io"
  }

  expect_failures = [var.legacy_zone_name]
}

run "zone_id_must_match_zone_name" {
  command = plan

  # The default zone name with another zone's id would put records in the wrong zone.
  variables {
    environment          = "prod"
    cloudflare_zone_name = "cml-relab.org"
    legacy_zone_name     = ""
  }

  expect_failures = [data.cloudflare_zone.this]
}
