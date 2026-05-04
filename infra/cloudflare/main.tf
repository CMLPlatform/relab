# spell-checker: ignore cfargotunnel

resource "cloudflare_zero_trust_tunnel_cloudflared" "relab" {
  account_id = var.cloudflare_account_id
  name       = local.tunnel_name
  config_src = "cloudflare"
}

resource "cloudflare_dns_record" "edge" {
  for_each = local.edge_routes

  zone_id = var.cloudflare_zone_id
  name    = each.value.hostname
  content = "${cloudflare_zero_trust_tunnel_cloudflared.relab.id}.cfargotunnel.com"
  type    = "CNAME"
  ttl     = 1
  proxied = true
  comment = "RELab ${var.environment} ${each.key} edge route managed by OpenTofu."
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "relab" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.relab.id

  config = {
    ingress = concat(
      [
        for route in values(local.edge_routes) : {
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
