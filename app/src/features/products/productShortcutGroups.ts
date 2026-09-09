import { Platform } from 'react-native';
import type { ShortcutGroupSpec } from '@/components/base/KeyboardShortcutsDialog';

const isMac =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * What the "?" overlay advertises for the products screens. It lives beside the
 * hooks that register these bindings (`useProductsListShortcuts` and
 * `useProductEditShortcuts`), so a changed key and its description move together.
 */
export const PRODUCT_SHORTCUT_GROUPS: ShortcutGroupSpec[] = [
  {
    title: 'Products list',
    items: [
      ['/', 'Search products'],
      ['n', 'New product'],
      ['f', 'Filters'],
    ],
  },
  {
    title: 'Product page',
    items: [
      ['e', 'Edit'],
      ['Esc', 'Leave edit mode'],
      [isMac ? '⌘ S' : 'Ctrl + S', 'Save'],
    ],
  },
];
