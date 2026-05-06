import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const caddyfile = readFileSync(resolve(__dirname, '../../Caddyfile'), 'utf8');
const HSTS_POLICY = 'max-age=63072000; includeSubDomains';
const HSTS_PATTERN = /^\s*Strict-Transport-Security\s+"([^"]+)"/m;
const REFERRER_POLICY_PATTERN = /^\s*Referrer-Policy\s+"([^"]+)"/m;
const CONTENT_TYPE_OPTIONS_PATTERN = /^\s*X-Content-Type-Options\s+"([^"]+)"/m;
const PERMISSIONS_POLICY_PATTERN = /^\s*Permissions-Policy\s+"([^"]+)"/m;
const ENFORCED_CSP_PATTERN = /^\s*Content-Security-Policy\s+"([^"]+)"/m;
const REPORT_ONLY_CSP_PATTERN = /^\s*Content-Security-Policy-Report-Only\s+"([^"]+)"/m;
const RESET_PASSWORD_REFERRER_POLICY_PATTERN =
  /@reset_password_route\s+path\s+\/reset-password\*\s+handle\s+@reset_password_route\s+\{\s+header\s+Referrer-Policy\s+"no-referrer"/s;

function enforcedCsp() {
  const match = caddyfile.match(ENFORCED_CSP_PATTERN);
  if (!match) {
    throw new Error('Missing enforced Content-Security-Policy header');
  }
  return match[1];
}

function reportOnlyCsp() {
  const match = caddyfile.match(REPORT_ONLY_CSP_PATTERN);
  if (!match) {
    throw new Error('Missing report-only Content-Security-Policy header');
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

describe('Caddy security headers', () => {
  it('sets the deployed OWASP HSTS policy', () => {
    expect(hsts()).toBe(HSTS_POLICY);
  });

  it('sets the browser baseline headers recommended by OWASP', () => {
    expect(contentTypeOptions()).toBe('nosniff');
    expect(referrerPolicy()).toBe('strict-origin-when-cross-origin');
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

    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it('observes a stricter script policy without unsafe eval', () => {
    expect(reportOnlyCsp()).not.toContain("'unsafe-eval'");
  });

  it('does not allow wildcard scripts or javascript URLs', () => {
    expect(enforcedCsp()).not.toContain('script-src *');
    expect(reportOnlyCsp()).not.toContain('script-src *');
    expect(enforcedCsp()).not.toContain('javascript:');
    expect(reportOnlyCsp()).not.toContain('javascript:');
  });

  it('sets no-referrer specifically on password reset routes', () => {
    expect(caddyfile).toMatch(RESET_PASSWORD_REFERRER_POLICY_PATTERN);
  });
});
