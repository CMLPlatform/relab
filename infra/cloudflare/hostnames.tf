# Shared between the per-environment root (infra/cloudflare) and the zone-global root
# (infra/cloudflare-zone) as a symlink, so the hostname map has exactly one definition.
# Edit the real file at infra/cloudflare/hostnames.tf.
locals {
  cloudflare_zone = var.cloudflare_zone_name

  # Origins are resolved inside the Docker Compose `edge` network by cloudflared.
  edge_routes_by_environment = {
    prod = {
      www = {
        hostname = local.cloudflare_zone
        origin   = "http://www:8081"
      }
      app = {
        hostname = "app.${local.cloudflare_zone}"
        origin   = "http://app:8081"
      }
      api = {
        hostname = "api.${local.cloudflare_zone}"
        origin   = "http://api:8000"
      }
      docs = {
        hostname = "docs.${local.cloudflare_zone}"
        origin   = "http://docs:8000"
      }
    }

    staging = {
      www = {
        hostname = "web-test.${local.cloudflare_zone}"
        origin   = "http://www:8081"
      }
      app = {
        hostname = "app-test.${local.cloudflare_zone}"
        origin   = "http://app:8081"
      }
      api = {
        hostname = "api-test.${local.cloudflare_zone}"
        origin   = "http://api:8000"
      }
      docs = {
        hostname = "docs-test.${local.cloudflare_zone}"
        origin   = "http://docs:8000"
      }
    }
  }
}
