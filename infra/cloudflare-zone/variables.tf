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

variable "telemetry_edge_key" {
  description = <<-EOT
    Value of the `X-Telemetry-Key` header that identifies the telemetry shippers
    to `otel.`, used to skip Cloudflare's bot and managed-security products for them.
    Export as TF_VAR_telemetry_edge_key; it must never be written into the repo. Empty
    (the default) omits the rule entirely, which keeps `just cloudflare-check` runnable
    without secrets.

    Deliberately NOT the OTLP bearer token: Cloudflare stores ruleset expressions in
    cleartext and returns them from the rulesets API and the dashboard, so whatever this
    rule matches is readable by any zone-read grant. A dedicated key limits that
    exposure to the managed-security skip, and the two credentials rotate independently.
    It must equal TELEMETRY_EDGE_KEY in the deploy hosts' root `.env` (the api's
    OTEL_EXPORTER_OTLP_HEADERS and Alloy both send it).

    NOTE: `otel.` is the monitoring stack's hostname, not Relab's. That stack manages its
    own Cloudflare config but declares no rulesets, so this root stays the single owner of
    the zone entrypoints — see the ownership note in README.md.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "e2e_edge_key" {
  description = <<-EOT
    Value of the `X-E2E-Key` header that identifies the Playwright end-to-end runs
    against the staging hosts, used to skip Super Bot Fight Mode for them. Export as
    TF_VAR_e2e_edge_key; it must never be written into the repo. Empty (the default)
    omits the rule entirely, which keeps `just cloudflare-check` runnable without secrets.

    Cloudflare stores ruleset expressions in cleartext and returns them from the rulesets
    API and the dashboard, so this key is readable by any zone-read grant. It is a
    dedicated value with no other use: it buys nothing but the bot-product skip, on the
    staging hosts only, and rotates independently of every other credential. The skip
    covers Super Bot Fight Mode only, never the managed WAF, so the E2E run still
    exercises the WAF behaviour prod gets.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}
