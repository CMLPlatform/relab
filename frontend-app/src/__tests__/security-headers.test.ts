import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const caddyfile = readFileSync(resolve(__dirname, '../../Caddyfile'), 'utf8');
const ENFORCED_CSP_PATTERN = /^\s*Content-Security-Policy\s+"([^"]+)"/m;
const REPORT_ONLY_CSP_PATTERN = /^\s*Content-Security-Policy-Report-Only\s+"([^"]+)"/m;

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

describe('Caddy security headers', () => {
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
});
