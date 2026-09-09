import { useSyncExternalStore } from 'react';

/**
 * Open state for the keyboard-shortcuts overlay.
 *
 * Shared because two things open it: the "?" key, and the TopNav button that makes it
 * discoverable to anyone who does not already know the convention. The dialog is mounted
 * once at the app shell and the button sits in a sibling subtree, so module state costs
 * less than a provider wrapping both for one boolean.
 */
let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return open;
}

function setOpen(next: boolean) {
  if (open === next) return;
  open = next;
  emit();
}

export function openShortcutsOverlay() {
  setOpen(true);
}

export function closeShortcutsOverlay() {
  setOpen(false);
}

export function useShortcutsOverlayOpen() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
