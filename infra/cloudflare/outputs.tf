output "environment" {
  description = "Environment managed by this state."
  value       = var.environment
}

output "tunnel_id" {
  description = "Cloudflare Tunnel ID for this environment."
  value       = cloudflare_zero_trust_tunnel_cloudflared.relab.id
}

output "hostnames" {
  description = "Public hostnames managed for this environment."
  value       = [for route in values(local.edge_routes) : route.hostname]
}
