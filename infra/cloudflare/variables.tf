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
  description = "Cloudflare zone ID for the zone that serves Relab."
  type        = string
}

variable "cloudflare_zone_name" {
  description = "Public DNS zone name for Relab edge hostnames."
  type        = string
  default     = "r9lab.io"
}

variable "github_owner" {
  description = "GitHub organization that owns the repository whose Environments this root manages."
  type        = string
  default     = "CMLPlatform"
}

variable "github_repository" {
  description = "Repository whose GitHub Environment holds this environment's image-build URLs."
  type        = string
  default     = "relab"
}

variable "github_reviewers" {
  description = "GitHub logins that approve every job using this Environment: prod's release gate, and staging's while its Cloudflare token is not scoped to its own Workers. Required."
  type        = list(string)
  default     = []
}

variable "legacy_zone_name" {
  description = <<-EOT
    Previous zone whose tunnel hostnames stay in the ingress while its redirect rules go
    live. Only the ingress changes: no DNS record or custom domain is created there.
    Empty (the default) leaves the previous zone out entirely.
  EOT
  type        = string
  default     = ""

  validation {
    condition     = var.legacy_zone_name != var.cloudflare_zone_name
    error_message = "legacy_zone_name must differ from cloudflare_zone_name: export TF_VAR_cloudflare_zone_name for the new zone."
  }
}
