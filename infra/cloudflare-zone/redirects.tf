# Redirects the route-map hostnames of redirect_environments to the same name under
# redirect_to_zone_name. Only the previous zone's workspace sets it. The entrypoint is
# separate from the others because Cloudflare allows one ruleset per (zone, phase); `name`
# stays "default" for the reason given in main.tf.
locals {
  redirect_rules = {
    for pair in flatten([
      for env, routes in local.edge_routes_by_environment : [
        for name, route in routes : {
          key      = "${env}_${name}"
          hostname = route.hostname
          # api clients must keep their method and body, which 307/308 preserve.
          status_code = name == "api" ? (var.redirect_permanent ? 308 : 307) : (var.redirect_permanent ? 301 : 302)
        }
      ] if contains(var.redirect_environments, env)
    ]) : pair.key => pair
  }
}

resource "cloudflare_ruleset" "redirects" {
  count = var.redirect_to_zone_name == "" ? 0 : 1

  zone_id     = var.cloudflare_zone_id
  name        = "default"
  description = "Redirects R9lab hostnames to ${var.redirect_to_zone_name}."
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [
    for key, rule in local.redirect_rules : {
      ref         = "relab_redirect_${key}"
      description = "Redirect ${rule.hostname} to ${var.redirect_to_zone_name}"
      expression  = "http.host eq \"${rule.hostname}\""
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code           = rule.status_code
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://${trimsuffix(rule.hostname, local.cloudflare_zone)}${var.redirect_to_zone_name}\", http.request.uri.path)"
          }
        }
      }
    }
  ]
}
