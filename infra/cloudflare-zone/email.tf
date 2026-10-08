# Email Routing is opt-in: with no email_forwards, nothing here exists.
locals {
  email_enabled      = length(var.email_forwards) > 0
  email_destinations = toset(values(var.email_forwards))
}

resource "cloudflare_email_routing_settings" "this" {
  count = local.email_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
}

# Creates the MX and SPF records Email Routing needs.
resource "cloudflare_email_routing_dns" "this" {
  count = local.email_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.cloudflare_zone_name
}

resource "cloudflare_email_routing_address" "destination" {
  for_each = local.email_destinations

  account_id = var.cloudflare_account_id
  email      = each.value
}

resource "cloudflare_email_routing_rule" "forward" {
  for_each = var.email_forwards

  zone_id = var.cloudflare_zone_id
  name    = "forward ${each.key}"
  enabled = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = "${each.key}@${var.cloudflare_zone_name}"
  }]

  actions = [{
    type  = "forward"
    value = [each.value]
  }]

  depends_on = [cloudflare_email_routing_address.destination]
}
