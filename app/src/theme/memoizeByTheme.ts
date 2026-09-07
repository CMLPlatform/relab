import type { AppTheme } from './types';

/**
 * Wrap a StyleSheet factory so the sheet is built once per theme object.
 * `useAppTheme()` returns the context theme by reference, so the WeakMap key
 * only changes on a light/dark toggle.
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
