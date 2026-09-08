import { useFocusEffect } from 'expo-router';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { Platform, type TextInput } from 'react-native';
import { useShortcutsEnabled } from '@/hooks/useShortcutsEnabled';
import { isPlainShortcut } from '@/utils/keyboardShortcuts';

/**
 * Web-only single-key shortcuts for the products list: "/" focuses search, "n"
 * starts a product, "f" toggles the filter row. Each routes to the same handler
 * as its on-screen control, so the guards those apply still apply. Focus-scoped.
 */
export function useProductsListShortcuts({
  searchRef,
  onNewProduct,
  onToggleFilters,
}: {
  searchRef: RefObject<TextInput | null>;
  onNewProduct: () => void;
  onToggleFilters: () => void;
}) {
  const shortcutsEnabled = useShortcutsEnabled();
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || !shortcutsEnabled) return;
      const onKey = (event: KeyboardEvent) => {
        if (isPlainShortcut(event, '/')) {
          event.preventDefault();
          searchRef.current?.focus();
          return;
        }
        if (isPlainShortcut(event, 'n')) {
          event.preventDefault();
          onNewProduct();
          return;
        }
        if (isPlainShortcut(event, 'f')) {
          event.preventDefault();
          onToggleFilters();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [shortcutsEnabled, searchRef, onNewProduct, onToggleFilters]),
  );
}
