terraform {
  required_version = ">= 1.8"

  # State and plan files hold the Cloudflare tunnel secret. Encrypt them when the
  # operator exports TF_VAR_state_passphrase; fall back to plaintext so
  # `just cloudflare-check` (validate + mocked test, no secrets) works unset.
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }

    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }

    method "unencrypted" "insecure" {}

    state {
      method = method.aes_gcm.state

      fallback {
        method = method.unencrypted.insecure
      }

      enforced = false
    }

    plan {
      method = method.aes_gcm.state

      fallback {
        method = method.unencrypted.insecure
      }

      enforced = false
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
