import { useSyncExternalStore } from 'react';
import { createModuleStore } from '@/utils/moduleStore';

/**
 * Open state for the keyboard-shortcuts overlay.
 *
 * Shared because two things open it: the "?" key, and the TopNav button that makes it
 * discoverable to anyone who does not already know the convention. The dialog is mounted
 * once at the app shell and the button sits in a sibling subtree, so module state costs
 * less than a provider wrapping both for one boolean.
 */
const store = createModuleStore(false);

export function openShortcutsOverlay() {
  store.set(true);
}

export function closeShortcutsOverlay() {
  store.set(false);
}

export function useShortcutsOverlayOpen() {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
