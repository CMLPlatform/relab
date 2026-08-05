import { radius } from '@/constants';
import { getAppTheme } from '@/theme';

test('radius tiers match DESIGN.md flat & sharp scale', () => {
  expect(radius.control).toBe(6);
  expect(radius.card).toBe(8);
  expect(radius.overlay).toBe(12);
  expect(radius.full).toBe(9999);
});

test('overlay elevation + scrim tokens match the flat & sharp scale in both schemes', () => {
  const rgbaColor = /^rgba\(\d{1,3},\d{1,3},\d{1,3},[0-9.]+\)$/;

  const light = getAppTheme('light');
  expect(light.tokens.elevation.overlay).toEqual({
    shadowColor: 'rgba(20,40,80,1)',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  });
  expect(light.tokens.overlay.scrim).toBe('rgba(12,18,32,0.50)');
  expect(light.tokens.overlay.scrim).toMatch(rgbaColor);

  const dark = getAppTheme('dark');
  expect(dark.tokens.elevation.overlay).toEqual({
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  });
  expect(dark.tokens.overlay.scrim).toBe('rgba(0,0,0,0.55)');
  expect(dark.tokens.overlay.scrim).toMatch(rgbaColor);
});
