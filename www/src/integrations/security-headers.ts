import { writeFile } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';

/**
 * The `_headers` file Cloudflare Workers static assets apply to every response.
 * HTML keeps the platform default (`public, max-age=0, must-revalidate`), so only
 * the long-lived paths set Cache-Control; a second rule setting it on the same
 * path would be joined to the first with a comma.
 *
 * Request methods are not set here: with no Worker script, the static-asset
 * server answers only GET and HEAD and refuses the rest (TRACE and CONNECT
 * included) with 405. A Worker script added later must keep that refusal.
 *
 * `apiOrigin` lets the homepage stats panel fetch the public stats API and the
 * hero load the featured teardown's photos from it. Without one, the policy
 * allows neither, which is what a build without PUBLIC_API_URL serves anyway.
 */
export function headersFile(apiOrigin: string | null): string {
  const api = apiOrigin ? ` ${apiOrigin}` : '';
  // Inline styles are still needed by Astro output. Scripts stay bundled and
  // same-origin, so the policy rejects inline and eval script.
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${api}`,
    `connect-src 'self'${api}`,
    "font-src 'self' data:",
    "frame-src 'none'",
    // Any HTTPS page may embed the site (in slides, say): it has no forms or
    // sessions to clickjack.
    'frame-ancestors https:',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');

  return [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Strict-Transport-Security: max-age=63072000; includeSubDomains',
    '  Referrer-Policy: no-referrer',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Resource-Policy: same-site',
    `  Content-Security-Policy: ${csp}`,
    '',
    // Content-hashed: a changed file is a new URL.
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    // Synced brand fonts keep stable filenames: a week keeps navigations cheap
    // and a font swap still propagates within days.
    '/fonts/*',
    '  Cache-Control: public, max-age=604800',
    '',
  ].join('\n');
}

/** Write `dist/_headers` after the build; `apiUrl` is the build's PUBLIC_API_URL. */
export function securityHeaders(apiUrl: string | undefined): AstroIntegration {
  const origin = apiUrl?.trim() ? new URL(apiUrl.trim()).origin : null;
  return {
    name: 'relab:security-headers',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await writeFile(new URL('_headers', dir), headersFile(origin));
      },
    },
  };
}
