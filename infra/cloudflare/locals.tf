# Per-environment locals. The hostname map itself lives in hostnames.tf, shared with
# the zone-global root.
locals {
  edge_routes   = local.edge_routes_by_environment[var.environment]
  tunnel_routes = { for name, route in local.edge_routes : name => route if route.origin != null }
  worker_routes = { for name, route in local.edge_routes : name => route if route.worker != null }
  # Same origins under the previous zone's names; ingress only (see var.legacy_zone_name).
  legacy_tunnel_routes = var.legacy_zone_name == "" ? {} : {
    for name, route in local.tunnel_routes : name => merge(route, {
      hostname = "${trimsuffix(route.hostname, local.cloudflare_zone)}${var.legacy_zone_name}"
    })
  }
  tunnel_name = "relab-${var.environment}"
}
