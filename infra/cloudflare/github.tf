# The GitHub Environment the image publish and the site deploy read their public URLs
# and Worker names from (.github/workflows/publish-images.yml, deploy-sites.yml). They
# derive from the same hostname map as the DNS records, tunnel ingress and custom
# domains, so a domain change lands everywhere with one apply.
#
# FEATURED_PRODUCT_ID is a content choice, not an edge setting, and CLOUDFLARE_API_TOKEN
# is a credential this root has no business minting: both are set by hand in the
# environment's settings and left alone here.
locals {
  github_public_url_variables = {
    API_PUBLIC_URL  = "https://${local.edge_routes.api.hostname}"
    APP_PUBLIC_URL  = "https://${local.edge_routes.app.hostname}"
    SITE_PUBLIC_URL = "https://${local.edge_routes.www.hostname}"
    DOCS_PUBLIC_URL = "https://${local.edge_routes.docs.hostname}"
  }

  # deploy-sites.yml deploys to the Worker each custom domain serves.
  github_environment_variables = merge(local.github_public_url_variables, {
    WWW_WORKER            = local.edge_routes.www.worker
    DOCS_WORKER           = local.edge_routes.docs.worker
    CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
  })
}

resource "github_repository_environment" "publish" {
  repository  = var.github_repository
  environment = var.environment

  # Prod URLs are baked in only from main, which is where release.yml runs. Staging
  # stays open so a manual publish of any branch can be tried there.
  dynamic "deployment_branch_policy" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      protected_branches     = false
      custom_branch_policies = true
    }
  }

  # Open to any branch, staging instead waits for a person: its CLOUDFLARE_API_TOKEN
  # (Workers Scripts: Edit) is account-wide and could deploy prod's Workers too.
  dynamic "reviewers" {
    for_each = var.environment == "staging" ? [1] : []
    content {
      users = [for user in data.github_user.staging_reviewer : user.id]
    }
  }

  lifecycle {
    precondition {
      condition     = var.environment != "staging" || length(var.github_staging_reviewers) > 0
      error_message = "staging needs at least one required reviewer: set TF_VAR_github_staging_reviewers."
    }
  }
}

data "github_user" "staging_reviewer" {
  for_each = toset(var.environment == "staging" ? var.github_staging_reviewers : [])
  username = each.value
}

resource "github_repository_environment_deployment_policy" "main" {
  count = var.environment == "prod" ? 1 : 0

  repository     = var.github_repository
  environment    = github_repository_environment.publish.environment
  branch_pattern = "main"
}

resource "github_actions_environment_variable" "publish" {
  for_each = local.github_environment_variables

  repository    = var.github_repository
  environment   = github_repository_environment.publish.environment
  variable_name = each.key
  value         = each.value
}
