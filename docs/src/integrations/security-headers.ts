import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
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
 * `apiOrigin` lets the API reference pages fetch the live OpenAPI document.
 * `scriptHashes` allow the inline scripts the build emitted, Starlight's among them.
 */
export function headersFile(apiOrigin: string | null, scriptHashes: string[]): string {
  const api = apiOrigin ? ` ${apiOrigin}` : '';
  const hashes = scriptHashes.map((hash) => ` '${hash}'`).join('');
  // Starlight still sets inline styles, so style-src keeps 'unsafe-inline'. Any
  // HTTPS page may embed the docs (in slides, say): they have no forms or
  // sessions to clickjack.
  const policy = [
    "default-src 'self'",
    `script-src 'self'${hashes}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self'${api}`,
    "font-src 'self' data:",
    "frame-src 'none'",
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
    `  Content-Security-Policy: ${policy}`,
    '',
    // Content-hashed: a changed file is a new URL.
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    // Favicons, OG cards and the synced fonts need stable URLs that crawlers and
    // browsers can pin: a week keeps navigations cheap, and a swap still
    // propagates within days.
    '/fonts/*',
    '  Cache-Control: public, max-age=604800',
    '',
    '/images/*',
    '  Cache-Control: public, max-age=604800',
    '',
  ].join('\n');
}

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

/** The sorted, distinct CSP hashes of every inline script in the given HTML pages. */
export function inlineScriptHashes(pages: string[]): string[] {
  const hashes = new Set<string>();
  for (const html of pages) {
    for (const [, body] of html.matchAll(INLINE_SCRIPT)) {
      if (body) hashes.add(`sha256-${createHash('sha256').update(body).digest('base64')}`);
    }
  }
  return [...hashes].sort();
}

/** Write `dist/_headers` after the build; `apiUrl` is the build's PUBLIC_BACKEND_API_URL. */
export function securityHeaders(apiUrl: string | undefined): AstroIntegration {
  const origin = apiUrl?.trim() ? new URL(apiUrl.trim()).origin : null;
  return {
    name: 'relab:security-headers',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const files = await readdir(dir, { recursive: true });
        const pages = await Promise.all(
          files.filter((f) => f.endsWith('.html')).map((f) => readFile(new URL(f, dir), 'utf8')),
        );
        await writeFile(new URL('_headers', dir), headersFile(origin, inlineScriptHashes(pages)));
      },
    },
  };
}
