import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@jest/globals';

// On web, Reanimated treats an entering animation built with `.withInitialValues()`
// as a custom keyframe, and once it ends pins the element to `position: absolute`
// at its snapshot size. Expanded tree rows then overlap the rows below them and the
// edit dock leaves the viewport corner. Use a stock preset (FadeInUp, FadeInDown, …).
const CUSTOM_INITIAL_VALUES = /\.withInitialValues\(/;

test('no entering animation sets custom initial values', () => {
  const root = join(__dirname, '..');
  const offenders = globSync('**/*.{ts,tsx}', { cwd: root })
    .filter((f) => !f.includes('__tests__'))
    .filter((f) => CUSTOM_INITIAL_VALUES.test(readFileSync(join(root, f), 'utf8')));
  expect(offenders).toEqual([]);
});
