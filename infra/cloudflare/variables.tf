variable "environment" {
  description = "RELab environment managed by this state."
  type        = string

  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "environment must be either prod or staging."
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the RELab tunnels."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for cml-relab.org."
  type        = string
}

variable "cloudflare_zone_name" {
  description = "Public DNS zone name for RELab edge hostnames."
  type        = string
  default     = "cml-relab.org"
}

variable "manage_shared_zone_rulesets" {
  description = <<-EOT
    Whether this workspace owns the zone-global rulesets (http_ratelimit,
    http_request_cache_settings, http_request_firewall_custom). Cloudflare allows
    exactly one entrypoint ruleset per (zone, phase), and prod + staging share the
    cml-relab.org zone, so exactly ONE workspace must manage them or applies clobber
    each other. These rulesets already carry rules for BOTH environments' hosts, so
    the owning workspace protects both. Enable in prod (default); disable in staging.
  EOT
  type        = bool
  default     = true
}
