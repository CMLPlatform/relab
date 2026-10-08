resource "cloudflare_zero_trust_tunnel_cloudflared" "relab" {
  account_id = var.cloudflare_account_id
  name       = local.tunnel_name
  config_src = "cloudflare"

  # Replacing the tunnel mints a new id, which every DNS record here points at and which
  # the host's cloudflared credentials no longer match: the environment is off the
  # internet until the new token reaches the host. Nothing in a routine edit should
  # destroy it, so make the accidental paths fail at plan time.
  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "edge" {
  for_each = local.tunnel_routes

  zone_id = var.cloudflare_zone_id
  name    = each.value.hostname
  content = "${cloudflare_zero_trust_tunnel_cloudflared.relab.id}.cfargotunnel.com"
  type    = "CNAME"
  ttl     = 1
  proxied = true
  comment = "Relab ${var.environment} ${each.key} edge route managed by OpenTofu."
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "relab" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.relab.id

  config = {
    ingress = concat(
      [
        for route in concat(values(local.tunnel_routes), values(local.legacy_tunnel_routes)) : {
          hostname = route.hostname
          service  = route.origin
        }
      ],
      [
        # Cloudflare requires a terminal ingress rule; unknown hostnames should not reach an origin.
        {
          service = "http_status:404"
        }
      ]
    )
  }
}

# Static sites served by a Worker. The custom domain owns its DNS record, and Cloudflare
# refuses one on a hostname that still has a CNAME: depends_on makes an apply that moves
# a hostname off the tunnel delete the old record first. The Worker must already exist,
# so deploy-sites.yml runs once before the apply that adds its domain.
resource "cloudflare_workers_custom_domain" "site" {
  for_each = local.worker_routes

  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = each.value.hostname
  service    = each.value.worker

  depends_on = [cloudflare_dns_record.edge]
}
