export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const breakpoints = {
  desktop: 768, // legacy alias for md; existing call sites keep working
  md: 768,
  lg: 1024,
} as const;

/**
 * The auth routes: no app chrome, and the photo backdrop stays visible behind
 * the light hero scrim. These are the `headerShown: false` screens in
 * app/_layout.tsx — one list, because TopNav and the background scrim both
 * need it and silently drifted apart when they were maintained separately.
 */
export const AUTH_HERO_PATHS = [
  '/login',
  '/onboarding',
  '/new-account',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/verify',
] as const;

/**
 * The subset of auth routes with content sitting bare on the backdrop — the
 * login mark and the new-account headline. They get the centre-weighted
 * gradient to read against; everywhere else the card does that job, so a flat
 * scrim is enough and the photo stays livelier.
 */
export const HERO_BAND_PATHS = ['/login', '/new-account'] as const;

// WCAG/Apple/Material converge on 44px as the minimum comfortable tap target.
export const MIN_TAP_TARGET = 44;

export const radius = {
  control: 6,
  card: 8,
  overlay: 12,
  full: 9999,
  // Back-compat aliases onto the new tiers above — existing call sites keep
  // compiling; migrate them to the semantic names opportunistically.
  sm: 6,
  md: 8,
  lg: 12,
} as const;
