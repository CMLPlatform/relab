locals {
  cloudflare_zone = "cml-relab.org"

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

  edge_routes = local.edge_routes_by_environment[var.environment]
  tunnel_name = "relab-${var.environment}"
}
