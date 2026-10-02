import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const caddyfile = readFileSync(resolve(__dirname, '../../Caddyfile'), 'utf8');
const HSTS_POLICY = 'max-age=63072000; includeSubDomains';
const HSTS_PATTERN = /^\s*Strict-Transport-Security\s+"([^"]+)"/m;
const REFERRER_POLICY_PATTERN = /^\s*Referrer-Policy\s+"([^"]+)"/m;
const CONTENT_TYPE_OPTIONS_PATTERN = /^\s*X-Content-Type-Options\s+"([^"]+)"/m;
const PERMISSIONS_POLICY_PATTERN = /^\s*Permissions-Policy\s+"([^"]+)"/m;
const ENFORCED_CSP_PATTERN = /^\s*Content-Security-Policy\s+"([^"]+)"/m;
const DANGEROUS_METHODS_PATTERN =
  /@dangerous_methods\s+method\s+([^\n]+)\s+handle\s+@dangerous_methods\s+\{(?<block>[\s\S]*?)\n\s*\}/m;
const METHOD_SPLIT_PATTERN = /\s+/;
const METHOD_ALLOW_HEADER_PATTERN =
  /header\s+Allow\s+"GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"/;
const METHOD_405_RESPONSE_PATTERN = /respond\s+"[^"]+"\s+405/;
const RESET_PASSWORD_REFERRER_POLICY_PATTERN =
  /@reset_password_route\s+path\s+\/reset-password\*\s+handle\s+@reset_password_route\s+\{\s+header\s+Referrer-Policy/s;
const SENSITIVE_AUTH_ROUTE_PATTERN =
  /@sensitive_auth_routes\s+path\s+([^\n]+)\s+handle\s+@sensitive_auth_routes\s+\{(?<block>[\s\S]*?)\n\s*\}/m;

function enforcedCsp() {
  const match = caddyfile.match(ENFORCED_CSP_PATTERN);
  if (!match) {
    throw new Error('Missing enforced Content-Security-Policy header');
  }
  return match[1];
}

function hsts() {
  const match = caddyfile.match(HSTS_PATTERN);
  if (!match) {
    throw new Error('Missing Strict-Transport-Security header');
  }
  return match[1];
}

function referrerPolicy() {
  const match = caddyfile.match(REFERRER_POLICY_PATTERN);
  if (!match) {
    throw new Error('Missing Referrer-Policy header');
  }
  return match[1];
}

function contentTypeOptions() {
  const match = caddyfile.match(CONTENT_TYPE_OPTIONS_PATTERN);
  if (!match) {
    throw new Error('Missing X-Content-Type-Options header');
  }
  return match[1];
}

function permissionsPolicy() {
  const match = caddyfile.match(PERMISSIONS_POLICY_PATTERN);
  if (!match) {
    throw new Error('Missing Permissions-Policy header');
  }
  return match[1];
}

function dangerousMethodPolicy() {
  const match = caddyfile.match(DANGEROUS_METHODS_PATTERN);
  if (!match?.groups?.block) {
    throw new Error('Missing dangerous method policy block');
  }
  return {
    block: match.groups.block,
    methods: match[1].trim().split(METHOD_SPLIT_PATTERN),
  };
}

function sensitiveAuthRoutePolicy() {
  const match = caddyfile.match(SENSITIVE_AUTH_ROUTE_PATTERN);
  if (!match?.groups?.block) {
    throw new Error('Missing sensitive auth route policy block');
  }
  return {
    block: match.groups.block,
    paths: match[1].trim().split(METHOD_SPLIT_PATTERN),
  };
}

describe('Caddy security headers', () => {
  it('blocks dangerous unsupported HTTP methods', () => {
    const policy = dangerousMethodPolicy();

    expect(policy.methods).toEqual(['TRACE', 'TRACK', 'CONNECT']);
    expect(policy.block).toMatch(METHOD_ALLOW_HEADER_PATTERN);
    expect(policy.block).toMatch(METHOD_405_RESPONSE_PATTERN);
  });

  it('sets the deployed OWASP HSTS policy', () => {
    expect(hsts()).toBe(HSTS_POLICY);
  });

  it('sets the browser baseline headers recommended by OWASP', () => {
    expect(contentTypeOptions()).toBe('nosniff');
    expect(referrerPolicy()).toBe('no-referrer');
    expect(caddyfile).toContain('Cross-Origin-Opener-Policy "same-origin"');
    expect(caddyfile).toContain('Cross-Origin-Resource-Policy "same-site"');
  });

  it('allows only the browser capability the app intentionally uses', () => {
    expect(permissionsPolicy()).toBe('camera=(self)');
  });

  it('allows only the intended YouTube embed origin for frames', () => {
    expect(enforcedCsp()).toContain('frame-src https://www.youtube-nocookie.com');
  });

  it('keeps OWASP baseline CSP directives enforced', () => {
    const policy = enforcedCsp();

    expect(policy).toContain('frame-ancestors https:');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).not.toContain('report-uri');
  });

  it('enforces same-origin scripts with no inline or eval allowance', () => {
    const policy = enforcedCsp();

    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toContain('script-src-elem');
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('javascript:');
    // React Native Web injects styles at runtime; inline style stays allowed.
    expect(policy.replace("style-src 'self' 'unsafe-inline'", '')).not.toContain("'unsafe-inline'");
  });

  it('ships no report-only policy, which nothing collects', () => {
    expect(caddyfile).not.toContain('Content-Security-Policy-Report-Only');
  });

  it('uses the global no-referrer policy for password reset routes', () => {
    expect(caddyfile).not.toMatch(RESET_PASSWORD_REFERRER_POLICY_PATTERN);
  });

  it('serves token-bearing auth routes without browser caching', () => {
    const policy = sensitiveAuthRoutePolicy();

    expect(policy.paths).toEqual(['/verify*', '/reset-password*']);
    expect(policy.block).toContain('header Cache-Control "no-store"');
    expect(policy.block).toContain('try_files {path} /index.html');
    expect(policy.block).toContain('file_server');
  });
});
