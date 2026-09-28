import { describe, expect, it } from 'vitest';
import { headersFile } from './security-headers.ts';

// Guards the deploy posture of the `_headers` file Cloudflare Workers serves the
// docs with. www carries the same checks for its own file.

const file = headersFile('https://api.example.test');

/** The header lines of one `_headers` rule, keyed by its path line. */
function rule(path: string): string[] {
  const block = file.split('\n\n').find((b) => b.startsWith(`${path}\n`));
  if (!block) throw new Error(`no rule for ${path}`);
  return block.split('\n').slice(1).filter(Boolean);
}

function header(name: string): string {
  const line = rule('/*').find((l) => l.startsWith(`  ${name}: `));
  if (!line) throw new Error(`Missing ${name} header`);
  return line.slice(`  ${name}: `.length);
}

function cspDirective(policy: string, directive: string) {
  return (
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${directive} `)) ?? ''
  );
}

const enforced = () => header('Content-Security-Policy');
const reportOnly = () => header('Content-Security-Policy-Report-Only');

describe('baseline security headers', () => {
  it('sets the deployed OWASP HSTS policy', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
  });

  it('sets the browser baseline headers recommended by OWASP', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('Cross-Origin-Resource-Policy')).toBe('same-site');
  });

  it('omits Permissions-Policy when no browser capabilities are used', () => {
    expect(file).not.toContain('Permissions-Policy');
  });
});

describe('CSP security headers', () => {
  it('enforces the OWASP baseline CSP directives', () => {
    const policy = enforced();

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain('frame-ancestors https:');
    expect(policy).not.toContain('report-uri');
  });

  it('allows inline script (Starlight) but never eval in the enforced policy', () => {
    const scriptPolicy = cspDirective(enforced(), 'script-src');

    expect(scriptPolicy).toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  it('tracks the stricter script policy in report-only mode', () => {
    const scriptPolicy = cspDirective(reportOnly(), 'script-src');

    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  it('lets the API reference fetch the live OpenAPI document', () => {
    expect(cspDirective(enforced(), 'connect-src')).toBe(
      "connect-src 'self' https://api.example.test",
    );
  });

  it('does not allow wildcard scripts or javascript URLs', () => {
    for (const policy of [enforced(), reportOnly()]) {
      expect(policy).not.toContain('script-src *');
      expect(policy).not.toContain('javascript:');
    }
  });
});

describe('cache headers', () => {
  // Two rules setting Cache-Control on one path are joined with a comma.
  it('sets Cache-Control only on the long-lived paths', () => {
    expect(rule('/*').some((line) => line.includes('Cache-Control'))).toBe(false);
    expect(rule('/_astro/*')).toEqual(['  Cache-Control: public, max-age=31536000, immutable']);
    expect(rule('/images/*')).toEqual(['  Cache-Control: public, max-age=604800']);
  });
});
