import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { palette } from '@/theme/palette.generated';

test('generated CSS carries the same hex values as the generated TS palette', () => {
  const css = readFileSync(join(__dirname, '..', 'brand.generated.css'), 'utf8');
  const cssLower = css.toLowerCase();
  for (const scheme of [palette.light, palette.dark]) {
    for (const value of Object.values(scheme)) {
      expect(cssLower).toContain(value.toLowerCase());
    }
  }
});

test('brand anchors match the Cyanotype palette (DESIGN.md)', () => {
  expect(palette.light.primary).toBe('#1F4C96');
  expect(palette.dark.primary).toBe('#8FB8FF');
  expect(palette.light.accent).toBe('#8F6212');
  expect(palette.dark.accent).toBe('#E3B95C');
});
