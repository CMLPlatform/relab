import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import extract from 'markdown-link-extractor';

const root = process.cwd();
const targets = ['README.md', 'src/content/docs'];
const skipProtocols = ['mailto:', 'tel:'];
const skipHosts = new Set(['localhost', '127.0.0.1']);

const files = [];

async function walk(entry) {
  const fullPath = path.join(root, entry);
  const stat = await readdir(fullPath, { withFileTypes: true }).catch(() => null);

  if (stat === null) {
    files.push(entry);
    return;
  }

  for (const child of stat) {
    const childPath = path.join(entry, child.name);
    if (child.isDirectory()) {
      await walk(childPath);
      continue;
    }
    if (child.name.endsWith('.md') || child.name.endsWith('.mdx')) {
      files.push(childPath);
    }
  }
}

for (const target of targets) {
  await walk(target);
}

const externalLinks = new Map();

for (const file of files) {
  const markdown = await readFile(path.join(root, file), 'utf8');
  for (const link of extract(markdown).links) {
    if (!link.startsWith('http')) continue;
    externalLinks.set(link, [...(externalLinks.get(link) ?? []), file]);
  }
}

const failures = [];
const warnings = [];

for (const [href, origins] of externalLinks) {
  if (skipProtocols.some((protocol) => href.startsWith(protocol))) continue;
  const url = new URL(href);
  if (skipHosts.has(url.hostname)) continue;

  let response;
  try {
    response = await fetch(href, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'user-agent': 'relab-docs-link-check/1.0',
      },
    });
  } catch {
    response = await fetch(href, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'relab-docs-link-check/1.0',
      },
    }).catch((error) => ({ ok: false, status: 0, error }));
  }

  if ('error' in response) {
    failures.push(`${href} (${origins.join(', ')}): ${response.error.message}`);
    continue;
  }

  if (response.ok) continue;

  if ([403, 405, 429].includes(response.status)) {
    warnings.push(`${href} (${origins.join(', ')}) responded with ${response.status}`);
    continue;
  }

  failures.push(`${href} (${origins.join(', ')}) responded with ${response.status}`);
}

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (failures.length > 0) {
  console.error('External link check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Checked ${externalLinks.size} external links.`);
