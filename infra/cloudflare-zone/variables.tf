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
  description = "Cloudflare zone ID of the zone this workspace manages."
  type        = string
}

variable "cloudflare_zone_name" {
  description = "Name of the zone this workspace manages; must match the zone id."
  type        = string
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

    NOTE: `otel.` is the monitoring stack's hostname, not R9lab's. That stack manages its
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

variable "redirect_to_zone_name" {
  description = <<-EOT
    Zone this zone's R9lab hostnames redirect to. Non-empty turns on the redirect ruleset,
    which covers exactly the hosts in the shared route map: monitoring and hand-made
    hosts are never redirected. Set it only in the previous zone's workspace.
  EOT
  type        = string
  default     = ""

  validation {
    condition     = var.redirect_to_zone_name != var.cloudflare_zone_name
    error_message = "redirect_to_zone_name must differ from cloudflare_zone_name: a zone cannot redirect to itself."
  }
}

variable "redirect_permanent" {
  description = "Redirect with 301/308 instead of 302/307. Keep false until the new zone is verified."
  type        = bool
  default     = false
}

variable "cloudflare_account_id" {
  description = <<-EOT
    Cloudflare account ID. Email Routing destination addresses belong to the account, not
    the zone. Export as TF_VAR_cloudflare_account_id. Empty (the default) keeps
    `just cloudflare-check` runnable without secrets; it is only read when
    email_forwards is non-empty.
  EOT
  type        = string
  default     = ""
}

variable "email_forwards" {
  description = <<-EOT
    Email Routing forwards, from local part to destination address. Empty (the default)
    manages no Email Routing resources at all, so routing set up by hand in the dashboard
    is never adopted or overwritten. Each destination must be verified once by clicking
    the link Cloudflare mails to it; until then forwarding to it does not deliver.
  EOT
  type        = map(string)
  default     = {}
}
