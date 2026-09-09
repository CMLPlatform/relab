import { designTokens } from '@/theme/tokens.generated';

/** Maintainer contact, shown wherever a user needs a human. Mirrors www's PUBLIC_CONTACT_EMAIL default. */
export const SUPPORT_EMAIL = 'relab@cml.leidenuniv.nl';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
} as const;

export const breakpoints = {
  md: 768,
  lg: 1024,
} as const;

/** The chrome-free auth routes (`headerShown: false` in app/_layout.tsx). TopNav and the scrim share this list. */
export const AUTH_HERO_PATHS = [
  '/login',
  '/onboarding',
  '/new-account',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/verify',
] as const;

/** Auth routes with content bare on the backdrop; they get the centre-weighted gradient. */
export const HERO_BAND_PATHS = ['/login', '/new-account'] as const;

// WCAG/Apple/Material converge on 44px as the minimum comfortable tap target.
export const MIN_TAP_TARGET = 44;

// Web focus indicator as `outline`, never Tailwind's `ring`: every control
// carries `shadow-none` (flattens a ring) and `outline-none` (sets
// `--tw-outline-style: none`, which `outline-2` inherits), so the explicit
// `outline-solid` is required or nothing paints. See DESIGN.md, Painted-Focus
// Rule; `app/e2e/accessibility.spec.ts` asserts the computed result.
export const WEB_FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

export const radius = designTokens.radius;

// Remote images fade in on load instead of painting top-down as bytes arrive.
// Without a `transition`, expo-image mounts the <img>/native view visible and
// the browser reveals a progressive JPEG/WebP line by line over the empty box.
export const IMAGE_FADE_MS = 150;
