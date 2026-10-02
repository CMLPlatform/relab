// Fail when the web export's first-load JavaScript grows past its budget.
//
// First load only: the scripts `index.html` itself references. Route chunks and the
// async ones (the CPV dataset, hls.js) are excluded on purpose: they are already
// split, and counting them would punish the splitting that keeps them off this path.
//
// Gzipped, because that is what crosses the wire. Brotli would be smaller again, but
// gzip is the floor every client gets and the number is meant to be comparable across
// runs, not optimistic.

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;

// Measured 2026-10-02: 837.4 KB across three scripts. entry is 320.3 KB (expo-router,
// react-native-web, react-dom, culori via uniwind); __common is 515.4 KB (reanimated, zod,
// gesture-handler, keyboard-controller and app code).
//
// __common holds every module that two or more routes share, and index.html loads it
// eagerly, so a component reused across routes lands on every first load. Split such a
// component with React.lazy at its call sites, as ProductImageGallery does.
//
// NOTE: culori is not the app's: Uniwind's web runtime parses colours with it
// (uniwind/core/web/webUtils), so it stays until Uniwind drops it. Icons are already
// imported one module each from `lucide-react-native/icons/*` (Icon.tsx); the barrel
// is only a type import.
//
// The budget is the measurement plus roughly 5%: enough that a dependency bump does not
// cry wolf, tight enough that a new library on the first-load path does. When it fails,
// either justify the new bytes in the commit or split the import.
//
// NOTE: zod (~60 KB gzipped) and react-hook-form (~15 KB with its zod resolver) stay in
// __common, and so on first load. The shell itself only touches zod for
// `z.config({ jitless: true })`; what keeps them eager is how Expo splits the web export:
// every route is an async chunk, and any module two async chunks share is hoisted into
// __common, which index.html loads up front. The product schemas are shared by the
// product detail, edit and capture routes and the forms by login, sign-up, onboarding and
// password reset, so moving them off this path would mean routing all validation through
// one dynamic import. Revisit if Expo's chunker gains a shared-async-chunk mode.
const BUDGET_BYTES = 875 * 1024;

const SCRIPT_TAG = /<script[^>]+src="([^"]+)"/g;
const LEADING_SLASH = /^\//;

function firstLoadScripts(html) {
  // Static export, so the entry scripts are plain tags; nothing here is injected at runtime.
  return [...html.matchAll(SCRIPT_TAG)]
    .map((match) => match[1])
    .filter((src) => src.endsWith('.js'));
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const scripts = firstLoadScripts(html);

if (scripts.length === 0) {
  console.error('No first-load scripts found in dist/index.html — was the export built?');
  process.exit(1);
}

const measured = scripts
  .map((src) => {
    const file = join(DIST, src.replace(LEADING_SLASH, ''));
    return { name: basename(file), bytes: gzipSync(readFileSync(file)).length };
  })
  .sort((a, b) => b.bytes - a.bytes);

const total = measured.reduce((sum, entry) => sum + entry.bytes, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

for (const entry of measured) {
  console.log(`  ${entry.name.padEnd(52)} ${kb(entry.bytes).padStart(10)}`);
}
console.log(
  `  ${'first-load JS (gzipped)'.padEnd(52)} ${kb(total).padStart(10)}  budget ${kb(BUDGET_BYTES)}`,
);

if (total > BUDGET_BYTES) {
  console.error(
    `\nFirst-load JS is ${kb(total - BUDGET_BYTES)} over budget.\n` +
      `Either split the new dependency off the root-layout path, or raise BUDGET_BYTES in\n` +
      `${basename(import.meta.url)} and say in the commit message what the bytes bought.`,
  );
  process.exit(1);
}
