import { radius } from '@/constants';
import { getAppTheme } from '@/theme';
import { designTokens } from '@/theme/tokens.generated';

const RGBA_COLOR_PATTERN = /^rgba\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*[0-9.]+\)$/;

test('radius tiers match DESIGN.md flat & sharp scale', () => {
  expect(radius.control).toBe(6);
  expect(radius.card).toBe(8);
  expect(radius.overlay).toBe(12);
  expect(radius.full).toBe(9999);
});

// These tokens are now read from `tokens.generated.ts` rather than hand-written
// here, and the generator emits `rgba(12, 18, 32, 0.50)` where this file used to
// declare `rgba(12,18,32,0.50)` — same colour, different whitespace, and `#000`
// where it declared the equivalent `rgba(0,0,0,1)`. Asserting the exact byte
// string pinned a formatting choice, not a design decision, so colours are
// compared by normalised value and the numbers stay exact.
const WHITESPACE_PATTERN = /\s+/g;
const BLACK_HEX_PATTERN = /^#000$/;
const normaliseColor = (value: string) =>
  value.replace(WHITESPACE_PATTERN, '').replace(BLACK_HEX_PATTERN, 'rgba(0,0,0,1)');

test('overlay elevation + scrim tokens match the flat & sharp scale in both schemes', () => {
  const light = getAppTheme('light');
  const lightOverlay = light.tokens.elevation.overlay;
  expect(normaliseColor(lightOverlay.shadowColor as string)).toBe('rgba(20,40,80,1)');
  expect(lightOverlay.shadowOpacity).toBe(0.16);
  expect(lightOverlay.shadowRadius).toBe(24);
  expect(lightOverlay.shadowOffset).toEqual({ width: 0, height: 8 });
  expect(lightOverlay.elevation).toBe(8);
  expect(normaliseColor(light.tokens.overlay.scrim)).toBe('rgba(12,18,32,0.50)');
  expect(light.tokens.overlay.scrim).toMatch(RGBA_COLOR_PATTERN);

  const dark = getAppTheme('dark');
  const darkOverlay = dark.tokens.elevation.overlay;
  expect(normaliseColor(darkOverlay.shadowColor as string)).toBe('rgba(0,0,0,1)');
  expect(darkOverlay.shadowOpacity).toBe(0.55);
  expect(darkOverlay.shadowRadius).toBe(24);
  expect(darkOverlay.shadowOffset).toEqual({ width: 0, height: 8 });
  // Android elevation is scheme-aware on purpose: a dark ground needs more lift
  // than a light one for the same perceived depth, matching the opacity split.
  expect(darkOverlay.elevation).toBe(12);
  expect(normaliseColor(dark.tokens.overlay.scrim)).toBe('rgba(0,0,0,0.55)');
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
