# Per-environment locals. The hostname map itself lives in hostnames.tf, shared with
# the zone-global root.
locals {
  edge_routes = local.edge_routes_by_environment[var.environment]
  tunnel_name = "relab-${var.environment}"
}
