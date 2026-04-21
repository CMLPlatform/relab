import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DOCS_ROOT = process.cwd();
const SCAN_ROOTS = ['src', 'public', 'package.json', 'README.md'];
const runtimePattern =
  /(import\s+.+?from\s+['"]https?:\/\/|src=['"]https?:\/\/|href=['"]https?:\/\/cdn\.|https?:\/\/cdn\.)/;

function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

async function walk(entry) {
  const fullPath = path.join(DOCS_ROOT, entry);
  const items = await readdir(fullPath, { withFileTypes: true }).catch(() => null);

  if (items === null) {
    return [entry];
  }

  const files = await Promise.all(
    items.map(function mapItem(item) {
      const childPath = path.join(entry, item.name);
      if (item.isDirectory()) {
        return walk(childPath);
      }
      return [childPath];
    }),
  );

  return files.flat();
}

async function scanFile(file) {
  const source = await readFile(path.join(DOCS_ROOT, file), 'utf8');
  if (runtimePattern.test(source)) {
    return file;
  }
  return null;
}

async function main() {
  const files = (await Promise.all(SCAN_ROOTS.map(walk))).flat();
  const failures = (await Promise.all(files.map(scanFile))).filter(Boolean);

  if (failures.length > 0) {
    writeStderr('CDN-hosted runtime imports are not allowed in docs:');
    for (const failure of failures) {
      writeStderr(`- ${failure}`);
    }
    process.exit(1);
  }

  writeStdout('No CDN-hosted runtime imports found.');
}

await main();
