terraform {
  required_version = ">= 1.8"

  # State is local, in terraform.tfstate.d/, and encrypted (see below). A remote
  # backend would buy locking, which needs more than one operator to be worth its
  # credentials — and durability, which generate-imports.sh already provides: losing
  # this state costs a re-import, not a rebuild.

  # Encrypted with no plaintext fallback, matching ../cloudflare: this state holds the
  # zone's whole security posture (rate limits, firewall rules), which is not something
  # to leave readable on a workstation. A missing TF_VAR_state_passphrase fails closed.
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
