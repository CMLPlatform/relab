import { describe, expect, test } from '@jest/globals';
import { palette } from '@/theme/palette.generated';
import { darkTheme, lightTheme } from '@/theme/themes';
import type { AppTheme } from '@/theme/types';

// `danger` resolves to theme.colors.error, which — unlike the other status
// tones (hardcoded hex in SEMANTIC_COLORS) — comes out of themes.ts's rgb()
// helper as an "rgb(r, g, b)" string; accept both formats.
const RGB_PATTERN = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/;
function toRgbTriple(color: string): [number, number, number] {
  const rgbMatch = color.match(RGB_PATTERN);
  if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  return [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
function luminance(color: string): number {
  const [r, g, b] = toRgbTriple(color).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// DESIGN.md: "All pairings meet WCAG 4.5:1 against their background in both schemes."
describe.each<[string, AppTheme, string]>([
  ['light', lightTheme, palette.light.background],
  ['dark', darkTheme, palette.dark.background],
])('%s scheme', (_scheme, theme, background) => {
  test('status and link text tones meet 4.5:1 on the page background', () => {
    const { success, warning, info, offline, danger, live } = theme.tokens.status;
    for (const tone of [success, warning, info, offline, danger, live, theme.tokens.text.link]) {
      expect(contrast(tone, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  test('solid status fills carry readable onStatus text', () => {
    const { live, success, warning, info, danger } = theme.tokens.status;
    for (const fill of [live, success, warning, info, danger]) {
      expect(contrast(theme.tokens.status.onStatus, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
