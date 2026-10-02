import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@jest/globals';

// AppButton styles its own label; an AppText child overrides that colour
// (and breaks contrast in one scheme). Pass a plain string instead.
const BUTTON_WITH_APPTEXT = /<AppButton\b[^>]*>\s*<AppText\b/;

// NOTE: DialogProvider's snackbar action takes its ink from the inverse surface, not the variant.
const ALLOWED = new Set(['components/base/DialogProvider.tsx']);

test('no AppButton wraps an AppText child', () => {
  const root = join(__dirname, '..');
  const offenders = globSync('**/*.tsx', { cwd: root })
    .filter((f) => !f.includes('__tests__') && !ALLOWED.has(f))
    .filter((f) => BUTTON_WITH_APPTEXT.test(readFileSync(join(root, f), 'utf8')));
  expect(offenders).toEqual([]);
});
