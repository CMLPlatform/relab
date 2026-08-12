import { radius } from '@/constants';
import { getAppTheme } from '@/theme';
import { designTokens } from '@/theme/tokens.generated';

const RGBA_COLOR_PATTERN = /^rgba\(\d{1,3},\d{1,3},\d{1,3},[0-9.]+\)$/;

test('radius tiers match DESIGN.md flat & sharp scale', () => {
  expect(radius.control).toBe(6);
  expect(radius.card).toBe(8);
  expect(radius.overlay).toBe(12);
  expect(radius.full).toBe(9999);
});

test('overlay elevation + scrim tokens match the flat & sharp scale in both schemes', () => {
  const light = getAppTheme('light');
  expect(light.tokens.elevation.overlay).toEqual({
    shadowColor: 'rgba(20,40,80,1)',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  });
  expect(light.tokens.overlay.scrim).toBe('rgba(12,18,32,0.50)');
  expect(light.tokens.overlay.scrim).toMatch(RGBA_COLOR_PATTERN);

  const dark = getAppTheme('dark');
  expect(dark.tokens.elevation.overlay).toEqual({
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  });
  expect(dark.tokens.overlay.scrim).toBe('rgba(0,0,0,0.55)');
  expect(dark.tokens.overlay.scrim).toMatch(RGBA_COLOR_PATTERN);
});

// RN shadow/scrim props are structured, not CSS strings, so tokens.ts keeps
// its own RN-shaped literals rather than parsing designTokens.shadowOverlay
// apart. This pins those literals against the generated source of truth.
test('RN overlay shadow matches tokens.json shadow-overlay', () => {
  expect(designTokens.shadowOverlay.light).toBe('0 8px 24px rgba(20, 40, 80, 0.16)');
  expect(designTokens.shadowOverlay.dark).toBe('0 8px 24px rgba(0, 0, 0, 0.55)');
  expect(designTokens.scrim.light).toBe('rgba(12, 18, 32, 0.50)');
  expect(designTokens.scrim.dark).toBe('rgba(0, 0, 0, 0.55)');
});
