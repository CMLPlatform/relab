terraform {
  required_version = ">= 1.8"

  # State is local, in terraform.tfstate.d/, and encrypted (see below). A remote
  # backend would buy locking, which needs more than one operator to be worth its
  # credentials — and durability, which generate-imports.sh already provides: losing
  # this state costs a re-import, not a rebuild.

  # State and plan files hold the Cloudflare tunnel secret, so both are encrypted
  # with no plaintext fallback: a missing TF_VAR_state_passphrase now fails closed
  # instead of silently writing the secret in the clear. `just cloudflare-check`
  # never opens state, so it still runs without a passphrase.
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
