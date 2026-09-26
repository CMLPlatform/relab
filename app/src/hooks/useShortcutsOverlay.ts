import { create } from 'zustand';

/**
 * Open state for the keyboard-shortcuts overlay.
 *
 * Shared because two things open it: the "?" key, and the TopNav button that makes it
 * discoverable to anyone who does not already know the convention. The dialog is mounted
 * once at the app shell and the button sits in a sibling subtree, so module state costs
 * less than a provider wrapping both for one boolean.
 */
const useOverlayStore = create<{ open: boolean }>()(() => ({ open: false }));

export function openShortcutsOverlay() {
  useOverlayStore.setState({ open: true });
}

export function closeShortcutsOverlay() {
  useOverlayStore.setState({ open: false });
}

export function useShortcutsOverlayOpen() {
  return useOverlayStore((state) => state.open);
}
