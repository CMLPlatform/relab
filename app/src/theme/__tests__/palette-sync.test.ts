import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { palette } from '@/theme/palette.generated';
import { darkTheme, lightTheme } from '@/theme/themes';

test('generated artifacts carry the canonical palette values verbatim (exact case)', () => {
  const canonical = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', '..', 'assets', 'palette.json'), 'utf8'),
  ) as typeof palette;
  const css = readFileSync(join(__dirname, '..', 'brand.generated.css'), 'utf8');
  for (const scheme of ['light', 'dark'] as const) {
    for (const [token, value] of Object.entries(canonical[scheme])) {
      expect(css).toContain(value);
      expect(palette[scheme][token as keyof typeof palette.light]).toBe(value);
    }
  }
});

test('brand anchors match the Cyanotype palette (DESIGN.md)', () => {
  expect(palette.light.primary).toBe('#1F4C96');
  expect(palette.dark.primary).toBe('#8FB8FF');
  expect(palette.light.accent).toBe('#8F6212');
  expect(palette.dark.accent).toBe('#E3B95C');
});

test('derived MD3 outline keeps the pre-inversion literal (light input token)', () => {
  expect(lightTheme.colors.outline).toBe('rgb(116, 119, 127)');
});

test('colors.card is the palette card fill (DESIGN.md "Card", same value as bg-card)', () => {
  expect(lightTheme.colors.card).toBe('rgb(240, 243, 250)');
  expect(darkTheme.colors.card).toBe('rgb(26, 32, 48)');
});
