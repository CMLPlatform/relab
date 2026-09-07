import { describe, expect, test } from '@jest/globals';
import { type PaletteScheme, palette } from '@/theme/palette.generated';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Regression for the `text-accent` remap in global.css: the vendored primitives
// hijack `--color-accent` for a neutral state layer, so brand-manila text must
// go through `text-manila` (--color-manila) instead — never `text-accent`.
// Widened to Record<...>: palette.light and palette.dark are `as const`
// literals with different per-key string values, so `typeof palette.light`
// alone rejects the `dark` row here.
describe.each<[string, Record<keyof PaletteScheme, string>]>([
  ['light', palette.light],
  ['dark', palette.dark],
])('%s scheme className text colors', (_scheme, scheme) => {
  test.each([
    ['text-manila', scheme.accent],
    ['text-muted-foreground', scheme.mutedForeground],
    ['text-destructive', scheme.destructive],
  ])('%s meets 4.5:1 against the page background', (_className, color) => {
    expect(contrast(color, scheme.background)).toBeGreaterThanOrEqual(4.5);
  });
});
