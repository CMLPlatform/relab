terraform {
  required_version = ">= 1.8"

  # State is local, in terraform.tfstate; this root uses the single default workspace,
  # while the edge root uses per-environment workspaces. Losing it costs a re-import, not
  # a rebuild.
  #
  # Encrypted with no plaintext fallback, matching ../cloudflare: this state holds the
  # zone's rate limits and firewall rules. A missing TF_VAR_state_passphrase fails closed.
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }

    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }

    state {
      method   = method.aes_gcm.state
      enforced = true
    }

    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {}
