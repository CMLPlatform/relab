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
