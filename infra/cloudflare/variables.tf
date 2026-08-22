variable "environment" {
  description = "Relab environment managed by this state."
  type        = string

  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "environment must be either prod or staging."
  }
}

variable "state_passphrase" {
  description = <<-EOT
    Passphrase encrypting local state and plan files (>= 16 characters). Export
    TF_VAR_state_passphrase before any plan or apply that touches real Cloudflare
    credentials. Empty (the default) keeps `just cloudflare-check` runnable without
    secrets; encryption is enforced, so an empty value fails closed rather than
    writing plaintext state.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Relab tunnels."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for cml-relab.org."
  type        = string
}

variable "cloudflare_zone_name" {
  description = "Public DNS zone name for Relab edge hostnames."
  type        = string
  default     = "cml-relab.org"
}
