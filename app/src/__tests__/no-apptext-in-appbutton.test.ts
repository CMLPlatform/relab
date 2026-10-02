import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@jest/globals';

// AppButton styles its own label; an AppText child overrides that colour
// (and breaks contrast in one scheme). Pass a plain string instead.
const BUTTON_WITH_APPTEXT = /<AppButton\b(?:(?!<\/AppButton>)[\s\S])*?<AppText\b/;

// NOTE: DialogProvider's snackbar action takes its ink from the inverse surface, not the variant.
// NOTE: detailRows' button stacks a label over a subtitle, which a plain string cannot express.
const ALLOWED = new Set([
  'components/base/DialogProvider.tsx',
  'components/cameras/detail/detailRows.tsx',
]);

test('no AppButton wraps an AppText child', () => {
  const root = join(__dirname, '..');
  const offenders = globSync('**/*.tsx', { cwd: root })
    .filter((f) => !f.includes('__tests__') && !ALLOWED.has(f))
    .filter((f) => BUTTON_WITH_APPTEXT.test(readFileSync(join(root, f), 'utf8')));
  expect(offenders).toEqual([]);
});
