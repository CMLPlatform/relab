import { radius } from '@/constants';
import { getAppTheme } from '@/theme';

test('radius tiers match DESIGN.md flat & sharp scale', () => {
  expect(radius.control).toBe(6);
  expect(radius.card).toBe(8);
  expect(radius.overlay).toBe(12);
  expect(radius.full).toBe(9999);
});

test('overlay elevation + scrim tokens exist in both schemes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const t = getAppTheme(scheme);
    expect(t.tokens.elevation.overlay).toBeTruthy();
    expect(t.tokens.overlay.scrim).toBeTruthy();
  }
});
