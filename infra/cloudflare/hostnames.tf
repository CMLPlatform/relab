# Shared between the per-environment root (infra/cloudflare) and the zone-global root
# (infra/cloudflare-zone) as a symlink, so the hostname map has exactly one definition.
# Edit the real file at infra/cloudflare/hostnames.tf.
locals {
  cloudflare_zone = var.cloudflare_zone_name

  # Each route has exactly one of `origin` or `worker`. An origin is resolved inside the
  # Docker Compose `edge` network by cloudflared. A worker is the Cloudflare Worker that
  # serves a static site (deployed by .github/workflows/deploy-sites.yml), bound to the
  # hostname as a Workers Custom Domain.
  edge_routes_by_environment = {
    prod = {
      www = {
        hostname = local.cloudflare_zone
        origin   = null
        worker   = "relab-www-prod"
      }
      app = {
        hostname = "app.${local.cloudflare_zone}"
        origin   = "http://app:8081"
        worker   = null
      }
      api = {
        hostname = "api.${local.cloudflare_zone}"
        origin   = "http://api:8000"
        worker   = null
      }
      docs = {
        hostname = "docs.${local.cloudflare_zone}"
        origin   = null
        worker   = "relab-docs-prod"
      }
    }

    staging = {
      www = {
        hostname = "web-test.${local.cloudflare_zone}"
        origin   = null
        worker   = "relab-www-staging"
      }
      app = {
        hostname = "app-test.${local.cloudflare_zone}"
        origin   = "http://app:8081"
        worker   = null
      }
      api = {
        hostname = "api-test.${local.cloudflare_zone}"
        origin   = "http://api:8000"
        worker   = null
      }
      docs = {
        hostname = "docs-test.${local.cloudflare_zone}"
        origin   = null
        worker   = "relab-docs-staging"
      }
    }
  }
}
