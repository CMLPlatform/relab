import { designTokens } from '@/theme/tokens.generated';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
} as const;

export const breakpoints = {
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

// Web focus indicator, as `outline` rather than Tailwind's `ring`.
//
// `ring-*` compiles to a box-shadow layer, and every control here also carries
// `shadow-none` (flat form language) plus `outline-none`. The result was that
// --tw-ring-shadow computed correctly but never composed into box-shadow, so
// focus-visible painted nothing at all and the UA fallback had been removed —
// the whole auth flow was keyboard-invisible. `outline` cannot be clipped by
// overflow, does not participate in shadow composition, and is what WCAG 2.2
// SC 2.4.13 Focus Appearance is written around. Keep `outline-none` for the
// resting state; this only applies on :focus-visible.
// `outline-solid` is load-bearing, not decoration. Every call site also carries
// `outline-none`, which sets `--tw-outline-style: none` UNCONDITIONALLY — not
// under a variant — and `outline-2` compiles to
// `outline-width: 2px; outline-style: var(--tw-outline-style)`. Without an
// explicit style under the same variant the width and colour resolve correctly
// and the outline still never paints.
//
// This is the second time this indicator was defeated by a base-layer reset
// silently neutralising the variant meant to override it: the previous
// implementation used `ring-*`, which compiles to a box-shadow layer that
// `shadow-none` then flattened. Both shipped green because nothing asserted
// that focus actually paints. `app/e2e/accessibility.spec.ts` now does.
export const WEB_FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

export const radius = designTokens.radius;
