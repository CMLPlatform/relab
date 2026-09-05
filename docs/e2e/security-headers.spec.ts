import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Guards the deploy posture of the docs Caddyfile. Runs node-side (no browser
// page) inside the existing Playwright suite since docs has no unit-test lane.
// The www subrepo carries the same checks for its own Caddyfile in
// www/config/security-headers.test.ts.

const ENFORCED_CSP_PATTERN = /^\s*Content-Security-Policy\s+"([^"]+)"/m;
const REPORT_ONLY_CSP_PATTERN = /^\s*Content-Security-Policy-Report-Only\s+"([^"]+)"/m;
const HSTS_POLICY = 'max-age=63072000; includeSubDomains';
const HSTS_PATTERN = /^\s*Strict-Transport-Security\s+"([^"]+)"/m;
const REFERRER_POLICY_PATTERN = /^\s*Referrer-Policy\s+"([^"]+)"/m;
const CONTENT_TYPE_OPTIONS_PATTERN = /^\s*X-Content-Type-Options\s+"([^"]+)"/m;
const PERMISSIONS_POLICY_HEADER_PATTERN = /^\s*Permissions-Policy\s+/m;
const DANGEROUS_METHODS_PATTERN =
  /@dangerous_methods\s+method\s+([^\n]+)\s+handle\s+@dangerous_methods\s+\{(?<block>[\s\S]*?)\n\s*\}/m;
const METHOD_SPLIT_PATTERN = /\s+/;
const METHOD_ALLOW_HEADER_PATTERN =
  /header\s+Allow\s+"GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"/;
const METHOD_405_RESPONSE_PATTERN = /respond\s+"[^"]+"\s+405/;

const caddyfile = readFileSync(resolve(import.meta.dirname, '../Caddyfile'), 'utf8');

function matchOrThrow(pattern: RegExp, description: string) {
  const match = caddyfile.match(pattern);
  if (!match) {
    throw new Error(`Missing ${description}`);
  }
  return match[1];
}

function cspDirective(policy: string, directive: string) {
  return (
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${directive} `)) ?? ''
  );
}

const enforced = () => matchOrThrow(ENFORCED_CSP_PATTERN, 'enforced Content-Security-Policy');
const reportOnly = () =>
  matchOrThrow(REPORT_ONLY_CSP_PATTERN, 'report-only Content-Security-Policy');

test.describe('Caddy baseline security headers', () => {
  test('blocks dangerous unsupported HTTP methods', () => {
    const match = caddyfile.match(DANGEROUS_METHODS_PATTERN);
    if (!match?.groups?.block) {
      throw new Error('Missing dangerous method policy block');
    }

    expect(match[1].trim().split(METHOD_SPLIT_PATTERN)).toEqual(['TRACE', 'TRACK', 'CONNECT']);
    expect(match.groups.block).toMatch(METHOD_ALLOW_HEADER_PATTERN);
    expect(match.groups.block).toMatch(METHOD_405_RESPONSE_PATTERN);
  });

  test('sets the deployed OWASP HSTS policy', () => {
    expect(matchOrThrow(HSTS_PATTERN, 'Strict-Transport-Security header')).toBe(HSTS_POLICY);
  });

  test('sets the browser baseline headers recommended by OWASP', () => {
    expect(matchOrThrow(CONTENT_TYPE_OPTIONS_PATTERN, 'X-Content-Type-Options header')).toBe(
      'nosniff',
    );
    expect(matchOrThrow(REFERRER_POLICY_PATTERN, 'Referrer-Policy header')).toBe('no-referrer');
    expect(caddyfile).toContain('Cross-Origin-Opener-Policy "same-origin"');
    expect(caddyfile).toContain('Cross-Origin-Resource-Policy "same-site"');
  });

  test('omits Permissions-Policy when no browser capabilities are used', () => {
    expect(caddyfile).not.toMatch(PERMISSIONS_POLICY_HEADER_PATTERN);
  });
});

test.describe('Caddy CSP security headers', () => {
  test('enforces the OWASP baseline CSP directives', () => {
    const policy = enforced();

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('report-uri');
  });

  test('allows inline script (Starlight) but never eval in the enforced policy', () => {
    const scriptPolicy = cspDirective(enforced(), 'script-src');

    expect(scriptPolicy).toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  test('tracks the stricter script policy in report-only mode', () => {
    const scriptPolicy = cspDirective(reportOnly(), 'script-src');

    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  test('does not allow wildcard scripts or javascript URLs', () => {
    for (const policy of [enforced(), reportOnly()]) {
      expect(policy).not.toContain('script-src *');
      expect(policy).not.toContain('javascript:');
    }
  });
});
