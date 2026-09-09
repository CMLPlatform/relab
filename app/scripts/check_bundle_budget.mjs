// Fail when the web export's first-load JavaScript grows past its budget.
//
// First load only: the scripts `index.html` itself references. Route chunks and the
// async ones (the CPV dataset, hls.js) are excluded on purpose — they are already
// split, and counting them would punish the splitting that keeps them off this path.
//
// Gzipped, because that is what crosses the wire. Brotli would be smaller again, but
// gzip is the floor every client gets and the number is meant to be comparable across
// runs, not optimistic.

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;

// Measured 2026-09-09 on the export at ecb4000b: 836.1 KB across three scripts, of which
// __common is 514.7 KB (react-native-reanimated, react-native-web, zod, gesture-handler,
// culori and the lucide icon set, all reachable from the root layout) and entry is
// 319.9 KB.
//
// The budget is the measurement plus roughly 5%: enough that a dependency bump does not
// cry wolf, tight enough that a new library on the first-load path does. Raising it is a
// decision worth making deliberately, so when it fails, either justify the new bytes in
// the commit or split the import.
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
