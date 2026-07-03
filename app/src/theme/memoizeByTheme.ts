import type { AppTheme } from './types';

/**
 * Wrap a StyleSheet factory so the sheet is built once per theme object rather
 * than on every render. `useAppTheme()` returns the Paper context theme by
 * reference, so the key is stable across renders and only changes on a
 * light/dark toggle (old entries are GC'd via WeakMap).
 */
export function memoizeByTheme<T>(build: (theme: AppTheme) => T): (theme: AppTheme) => T {
  const cache = new WeakMap<AppTheme, T>();
  return (theme) => {
    let styles = cache.get(theme);
    if (!styles) {
      styles = build(theme);
      cache.set(theme, styles);
    }
    return styles;
  };
}
