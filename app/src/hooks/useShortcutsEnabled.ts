import { useSyncExternalStore } from 'react';
import { getLocalItem, setLocalItem } from '@/services/storage';
import { createModuleStore } from '@/utils/moduleStore';

/**
 * WCAG 2.2 SC 2.1.4 Character Key Shortcuts (level A) requires a way to turn
 * single-character shortcuts off: a stray keystroke from speech input or a
 * tremor must not fire an action. This is that switch.
 *
 * Device-local, not a user preference: it belongs to the keyboard in front of
 * you, and the shortcuts work signed out, so the switch has to as well. It
 * survives sign-out for the same reason — an accessibility setting that resets
 * itself is not a setting.
 */
const STORAGE_KEY = 'relab-keyboard-shortcuts';

// Default to on until storage answers; a stored "false" flips it on the next tick.
const store = createModuleStore(true);

getLocalItem(STORAGE_KEY)
  .then((stored) => {
    if (stored === null) return;
    store.set(stored === 'true');
  })
  .catch(() => {
    // Unreadable storage keeps the default. Shortcuts are a convenience.
  });

export function setShortcutsEnabled(next: boolean) {
  store.set(next);
  setLocalItem(STORAGE_KEY, String(next)).catch(() => {
    // The switch still holds for this session; only persistence was lost.
  });
}

export function useShortcutsEnabled() {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
