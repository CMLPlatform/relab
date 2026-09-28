import { describe, expect, it } from 'vitest';
import { headersFile } from './security-headers.ts';

// Guards the deploy posture of the `_headers` file Cloudflare Workers serves the
// site with. docs carries the same checks for its own file.

const file = headersFile('https://api.example.test');

/** The header lines of one `_headers` rule, keyed by its path line. */
function rule(path: string, source = file): string[] {
  const block = source.split('\n\n').find((b) => b.startsWith(`${path}\n`));
  if (!block) throw new Error(`no rule for ${path}`);
  return block.split('\n').slice(1).filter(Boolean);
}

function header(name: string, source = file): string {
  const line = rule('/*', source).find((l) => l.startsWith(`  ${name}: `));
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
  const enforced = () => header('Content-Security-Policy');

  it('enforces the OWASP baseline CSP directives', () => {
    const policy = enforced();

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain('frame-ancestors https:');
    expect(policy).not.toContain('report-uri');
  });

  it('rejects inline and eval script in the enforced policy', () => {
    const scriptPolicy = cspDirective(enforced(), 'script-src');

    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  // The API serves the featured teardown's photos and the stats, so its origin has
  // to be an allowed source or the hero and the stats panel break.
  it('allows the API origin for images and fetches', () => {
    expect(cspDirective(enforced(), 'img-src')).toBe(
      "img-src 'self' data: https://api.example.test",
    );
    expect(cspDirective(enforced(), 'connect-src')).toBe(
      "connect-src 'self' https://api.example.test",
    );
  });

  it('allows no API origin when the build has none', () => {
    expect(cspDirective(header('Content-Security-Policy', headersFile(null)), 'connect-src')).toBe(
      "connect-src 'self'",
    );
  });

  it('ships no report-only policy, which nothing collects', () => {
    expect(file).not.toContain('Content-Security-Policy-Report-Only');
  });

  it('does not allow wildcard scripts or javascript URLs', () => {
    const policy = enforced();

    expect(policy).not.toContain('script-src *');
    expect(policy).not.toContain('javascript:');
  });
});

describe('cache headers', () => {
  // Two rules setting Cache-Control on one path are joined with a comma, which
  // would make hashed assets `no-cache, immutable`. HTML keeps the platform default.
  it('sets Cache-Control only on the long-lived paths', () => {
    expect(rule('/*').some((line) => line.includes('Cache-Control'))).toBe(false);
    expect(rule('/_astro/*')).toEqual(['  Cache-Control: public, max-age=31536000, immutable']);
    expect(rule('/fonts/*')).toEqual(['  Cache-Control: public, max-age=604800']);
  });
});
