import { describe, expect, test } from '@jest/globals';
import { palette } from '@/theme/palette.generated';
import { darkTheme, lightTheme } from '@/theme/themes';
import type { AppTheme } from '@/theme/types';

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

// DESIGN.md: "All pairings meet WCAG 4.5:1 against their background in both schemes."
describe.each<[string, AppTheme, string]>([
  ['light', lightTheme, palette.light.background],
  ['dark', darkTheme, palette.dark.background],
])('%s scheme', (_scheme, theme, background) => {
  test('status and link text tones meet 4.5:1 on the page background', () => {
    const { success, warning, info, offline } = theme.tokens.status;
    for (const tone of [success, warning, info, offline, theme.tokens.text.link]) {
      expect(contrast(tone, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  test('solid status fills carry readable onStatus text', () => {
    const { live, success, warning, info } = theme.tokens.status;
    for (const fill of [live, success, warning, info]) {
      expect(contrast(theme.tokens.status.onStatus, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
