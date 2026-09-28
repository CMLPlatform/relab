# Per-environment locals. The hostname map itself lives in hostnames.tf, shared with
# the zone-global root.
locals {
  edge_routes   = local.edge_routes_by_environment[var.environment]
  tunnel_routes = { for name, route in local.edge_routes : name => route if route.origin != null }
  worker_routes = { for name, route in local.edge_routes : name => route if route.worker != null }
  tunnel_name   = "relab-${var.environment}"
}
