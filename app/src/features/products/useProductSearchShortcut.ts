import { useFocusEffect } from 'expo-router';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { Platform, type TextInput } from 'react-native';

/**
 * Web-only "/" shortcut that focuses the products search field, unless the
 * user is already typing into a text field — input, textarea, contenteditable
 * host or ARIA textbox — (so "/" in a search query or any other input still
 * types a literal slash), or a modal dialog is open (so "/" inside a dialog
 * never yanks focus back to the products screen behind it). Scoped to the products screen via useFocusEffect so it doesn't fire
 * while another tab/route is focused.
 */
export function useProductSearchShortcut(searchRef: RefObject<TextInput | null>) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return;
      const onKey = (event: KeyboardEvent) => {
        // biome-ignore lint/security/noSecrets: an ARIA attribute selector, not a secret.
        if (document.querySelector('[aria-modal="true"]')) return;
        const target = event.target as HTMLElement | null;
        if (
          event.key !== '/' ||
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          // contenteditable hosts and ARIA-only textboxes type text too, but
          // carry neither tag name.
          target?.isContentEditable ||
          target?.getAttribute?.('role') === 'textbox'
        ) {
          return;
        }
        event.preventDefault();
        searchRef.current?.focus();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [searchRef]),
  );
}
