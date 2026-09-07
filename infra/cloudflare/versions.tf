terraform {
  required_version = ">= 1.8"

  # State is local, in terraform.tfstate.d/. Losing it costs a re-import, not a rebuild;
  # generate-imports.sh rebuilds the import blocks.
  #
  # State and plan files hold the Cloudflare tunnel secret, so both are encrypted with no
  # plaintext fallback: a missing TF_VAR_state_passphrase fails closed. `just
  # cloudflare-check` never opens state, so it runs without a passphrase.
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
