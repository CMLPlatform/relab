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

  depends_on = [cloudflare_email_routing_settings.this]
}

resource "cloudflare_email_routing_address" "destination" {
  for_each = local.email_destinations

  account_id = var.cloudflare_account_id
  email      = each.value

  lifecycle {
    precondition {
      condition     = var.cloudflare_account_id != ""
      error_message = "cloudflare_account_id is required when email_forwards is set (export TF_VAR_cloudflare_account_id)."
    }
  }
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

# DMARC in monitoring mode: reports only, no mail is rejected. Outbound mail is signed by the
# sending provider, whose DKIM and SPF records are added by hand, not here.
resource "cloudflare_dns_record" "dmarc" {
  count = local.email_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.cloudflare_zone_name}"
  type    = "TXT"
  # Quoted, as Cloudflare recommends for TXT content.
  content = "\"v=DMARC1; p=none; rua=mailto:info@${var.cloudflare_zone_name}\""
  ttl     = 1
  comment = "R9lab DMARC policy managed by OpenTofu."
}
