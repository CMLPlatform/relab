import type { AppTheme } from './types';

/**
 * Wrap a StyleSheet factory so the sheet is built once per theme object rather
 * than on every render. `useAppTheme()` returns the Paper context theme by
 * reference, so the key is stable across renders and only changes on a
 * light/dark toggle (old entries are GC'd via WeakMap).
 */
export function memoizeByTheme<T>(build: (theme: AppTheme) => T): (theme: AppTheme) => T {
  // Wrap the value so a falsy build() result (0, '', null) still counts as cached;
  // the wrapper object is always truthy, so `!entry` only fires when genuinely absent.
  const cache = new WeakMap<AppTheme, { value: T }>();
  return (theme) => {
    let entry = cache.get(theme);
    if (!entry) {
      entry = { value: build(theme) };
      cache.set(theme, entry);
    }
    return entry.value;
  };
}
