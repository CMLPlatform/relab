// biome-ignore lint/correctness/noNodejsModules: this regression test reads deployment Caddyfiles.
import { readFileSync } from 'node:fs';
// biome-ignore lint/correctness/noNodejsModules: this regression test reads deployment Caddyfiles.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENFORCED_CSP_PATTERN = /^\s*Content-Security-Policy\s+"([^"]+)"/m;
const REPORT_ONLY_CSP_PATTERN = /^\s*Content-Security-Policy-Report-Only\s+"([^"]+)"/m;

function readCaddyfile(relativePath: string) {
  return readFileSync(resolve(import.meta.dirname, relativePath), 'utf8');
}

function enforcedCsp(caddyfile: string) {
  const match = caddyfile.match(ENFORCED_CSP_PATTERN);
  if (!match) {
    throw new Error('Missing enforced Content-Security-Policy header');
  }
  return match[1];
}

function reportOnlyCsp(caddyfile: string) {
  const match = caddyfile.match(REPORT_ONLY_CSP_PATTERN);
  if (!match) {
    throw new Error('Missing report-only Content-Security-Policy header');
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

describe('Caddy security headers', () => {
  it.each([
    ['frontend-web', readCaddyfile('../../Caddyfile')],
    ['docs', readCaddyfile('../../../docs/Caddyfile')],
  ])('%s enforces the OWASP baseline CSP directives', (_name, caddyfile) => {
    const policy = enforcedCsp(caddyfile);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it.each([
    ['frontend-web', readCaddyfile('../../Caddyfile'), false],
    ['docs', readCaddyfile('../../../docs/Caddyfile'), true],
  ])('%s has the expected inline-script enforcement posture', (_name, caddyfile, allowsInline) => {
    const scriptPolicy = cspDirective(enforcedCsp(caddyfile), 'script-src');

    if (allowsInline) {
      expect(scriptPolicy).toContain("'unsafe-inline'");
    } else {
      expect(scriptPolicy).not.toContain("'unsafe-inline'");
    }
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  it.each([
    ['docs', readCaddyfile('../../../docs/Caddyfile')],
  ])('%s observes a stricter script policy without unsafe eval', (_name, caddyfile) => {
    const scriptPolicy = cspDirective(reportOnlyCsp(caddyfile), 'script-src');

    expect(scriptPolicy).not.toContain("'unsafe-eval'");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
  });

  it.each([
    ['frontend-web', readCaddyfile('../../Caddyfile')],
    ['docs', readCaddyfile('../../../docs/Caddyfile')],
  ])('%s does not allow wildcard scripts or javascript URLs', (_name, caddyfile) => {
    const enforced = enforcedCsp(caddyfile);
    const reportOnly = reportOnlyCsp(caddyfile);

    expect(enforced).not.toContain('script-src *');
    expect(reportOnly).not.toContain('script-src *');
    expect(enforced).not.toContain('javascript:');
    expect(reportOnly).not.toContain('javascript:');
  });
});
