output "zone_name" {
  description = "Zone these rulesets and settings apply to."
  value       = var.cloudflare_zone_name
}

output "protected_api_hosts" {
  description = "API hostnames the zone rulesets match, across every environment."
  value = [
    local.edge_routes_by_environment.prod.api.hostname,
    local.edge_routes_by_environment.staging.api.hostname,
  ]
}
