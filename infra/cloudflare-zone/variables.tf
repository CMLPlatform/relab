variable "state_passphrase" {
  description = <<-EOT
    Passphrase encrypting local state and plan files (>= 16 characters). Export
    TF_VAR_state_passphrase before any plan or apply. Empty (the default) keeps
    `just cloudflare-check` runnable without secrets; encryption is enforced, so an
    empty value fails closed rather than writing plaintext state.
  EOT
  type        = string
  sensitive   = true
  default     = ""
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

variable "telemetry_ingress_authorization" {
  description = <<-EOT
    Exact Authorization header value that identifies the telemetry shipper to `logs.`
    and `otlp.`, used to skip Cloudflare's bot and managed-security products for it.
    Export as TF_VAR_telemetry_ingress_authorization; it must never be written into the
    repo. Empty (the default) omits the rule entirely, which keeps `just cloudflare-check`
    runnable without secrets.

    The whole header value, scheme included. The CML monitoring stack issues
    `Bearer <OTLP_AUTH_TOKEN>`; an older Basic credential predates it. It must match
    OTEL_EXPORTER_OTLP_HEADERS on the deploy hosts exactly, so the two rotate together.

    NOTE: `otlp.` is the monitoring stack's hostname, not Relab's. That stack manages its
    own Cloudflare config but declares no rulesets, so this root stays the single owner of
    the zone entrypoints — see the ownership note in README.md.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}
