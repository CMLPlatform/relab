import type { AppTheme } from './types';

/**
 * Wrap a StyleSheet factory so the sheet is built once per theme object rather
 * than on every render. `useAppTheme()` returns the Paper context theme by
 * reference, so the key is stable across renders and only changes on a
 * light/dark toggle (old entries are GC'd via WeakMap).
 *
 * NOTE: still has active consumers (e.g. src/app/users/[username].tsx,
 * src/utils/router/styles.ts, src/components/profile/MfaDialogs.tsx,
 * src/components/cameras/*, src/components/base/OtpInput.tsx,
 * src/components/product/gallery/*) — do not delete.
 */
export function memoizeByTheme<T>(build: (theme: AppTheme) => T): (theme: AppTheme) => T {
  const cache = new WeakMap<AppTheme, T>();
  return (theme) => {
    if (!cache.has(theme)) {
      cache.set(theme, build(theme));
    }
    return cache.get(theme) as T;
  };
}
