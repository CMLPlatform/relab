# Plan-only tests for Email Routing. The provider is mocked, so these need no Cloudflare
# credentials and make no API calls.

mock_provider "cloudflare" {
  override_data {
    target = data.cloudflare_zone.this
    values = {
      name = "r9lab.io"
    }
  }
}

variables {
  cloudflare_zone_id    = "11111111111111111111111111111111"
  cloudflare_zone_name  = "r9lab.io"
  cloudflare_account_id = "22222222222222222222222222222222"
}

run "forwards_info" {
  command = plan

  variables {
    email_forwards = { info = "relab@cml.leidenuniv.nl" }
  }

  assert {
    condition     = length(cloudflare_email_routing_rule.forward) == 1
    error_message = "expected one rule per forward."
  }

  assert {
    condition     = cloudflare_email_routing_rule.forward["info"].matchers[0].value == "info@r9lab.io"
    error_message = "the rule must match the local part on the zone's own name."
  }

  assert {
    condition     = cloudflare_email_routing_rule.forward["info"].actions[0].value == tolist(["relab@cml.leidenuniv.nl"])
    error_message = "the rule must forward to the configured destination."
  }
}

run "no_routing_by_default" {
  command = plan

  assert {
    condition = alltrue([
      length(cloudflare_email_routing_settings.this) == 0,
      length(cloudflare_email_routing_dns.this) == 0,
      length(cloudflare_email_routing_address.destination) == 0,
      length(cloudflare_email_routing_rule.forward) == 0,
    ])
    error_message = "an empty email_forwards map must manage no Email Routing resources."
  }
}
