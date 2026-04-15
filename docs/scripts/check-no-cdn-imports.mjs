import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['src', 'public', 'package.json', 'README.md'];
const failures = [];
const runtimePattern =
  /(import\s+.+?from\s+['"]https?:\/\/|src=['"]https?:\/\/|href=['"]https?:\/\/cdn\.|https?:\/\/cdn\.)/;

async function walk(entry) {
  const fullPath = path.join(root, entry);
  const items = await readdir(fullPath, { withFileTypes: true }).catch(() => null);

  if (items === null) {
    return [entry];
  }

  const files = [];
  for (const item of items) {
    const childPath = path.join(entry, item.name);
    if (item.isDirectory()) {
      files.push(...(await walk(childPath)));
      continue;
    }
    files.push(childPath);
  }
  return files;
}

for (const scanRoot of scanRoots) {
  const files = await walk(scanRoot);
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    if (runtimePattern.test(source)) {
      failures.push(file);
    }
  }
}

if (failures.length > 0) {
  console.error('CDN-hosted runtime imports are not allowed in docs:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('No CDN-hosted runtime imports found.');
