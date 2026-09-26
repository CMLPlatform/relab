import { create } from 'zustand';
import { type PersistStorage, persist } from 'zustand/middleware';
import { getLocalItem, setLocalItem } from '@/services/storage';

/**
 * WCAG 2.2 SC 2.1.4 Character Key Shortcuts (level A) requires a way to turn
 * single-character shortcuts off: a stray keystroke from speech input or a
 * tremor must not fire an action. This is that switch.
 *
 * Device-local, not a user preference: it belongs to the keyboard in front of
 * you, and the shortcuts work signed out, so the switch has to as well. It
 * survives sign-out for the same reason, an accessibility setting that resets
 * itself is not a setting.
 */
const STORAGE_KEY = 'relab-keyboard-shortcuts';

type ShortcutsState = { enabled: boolean };

// Keeps the stored value a bare "true"/"false" string, the format earlier builds wrote.
const storage: PersistStorage<ShortcutsState> = {
  getItem: async (name) => {
    const stored = await getLocalItem(name);
    return stored === null ? null : { state: { enabled: stored === 'true' } };
  },
  setItem: (name, value) =>
    setLocalItem(name, String(value.state.enabled)).catch(() => {
      // The switch still holds for this session; only persistence was lost.
    }),
  removeItem: () => {},
};

// Defaults to on until storage answers; unreadable storage keeps the default.
const useShortcutsStore = create<ShortcutsState>()(
  persist((): ShortcutsState => ({ enabled: true }), { name: STORAGE_KEY, storage }),
);

export function setShortcutsEnabled(next: boolean) {
  useShortcutsStore.setState({ enabled: next });
}

export function useShortcutsEnabled() {
  return useShortcutsStore((state) => state.enabled);
}
