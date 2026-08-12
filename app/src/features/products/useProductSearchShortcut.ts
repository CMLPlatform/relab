import type { RefObject } from 'react';
import { useEffect } from 'react';
import { Platform, type TextInput } from 'react-native';

/**
 * Web-only "/" shortcut that focuses the products search field, unless the
 * user is already typing into a text field (so "/" in a search query or any
 * other input still types a literal slash).
 */
export function useProductSearchShortcut(searchRef: RefObject<TextInput | null>) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchRef]);
}
