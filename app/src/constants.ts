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
