# The GitHub Environment the image publish reads its public URLs from
# (.github/workflows/publish-images.yml). The URLs derive from the same hostname map as
# the DNS records and tunnel ingress, so a domain change lands in both with one apply.
#
# FEATURED_PRODUCT_ID is a content choice, not an edge setting: it is set by hand in the
# environment's settings and left alone here.
locals {
  github_public_url_variables = {
    API_PUBLIC_URL  = "https://${local.edge_routes.api.hostname}"
    APP_PUBLIC_URL  = "https://${local.edge_routes.app.hostname}"
    SITE_PUBLIC_URL = "https://${local.edge_routes.www.hostname}"
    DOCS_PUBLIC_URL = "https://${local.edge_routes.docs.hostname}"
  }
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
}

resource "github_repository_environment_deployment_policy" "main" {
  count = var.environment == "prod" ? 1 : 0

  repository     = var.github_repository
  environment    = github_repository_environment.publish.environment
  branch_pattern = "main"
}

resource "github_actions_environment_variable" "public_url" {
  for_each = local.github_public_url_variables

  repository    = var.github_repository
  environment   = github_repository_environment.publish.environment
  variable_name = each.key
  value         = each.value
}
