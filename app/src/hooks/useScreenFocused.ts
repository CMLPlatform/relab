import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

// Some test mocks of expo-router omit useFocusEffect; fall back to a no-op so
// the hook simply reports "focused" there. Resolved once at module load, so
// the same hook is called on every render (rules-of-hooks safe).
const useFocusEffectSafe: typeof useFocusEffect =
  typeof useFocusEffect === 'function' ? useFocusEffect : () => {};

/**
 * Whether the enclosing navigation screen is currently focused.
 *
 * Built on useFocusEffect so it degrades to `true` when the router is mocked
 * (tests) — polling queries gate their `subscribed` flag on this so stacked
 * screens stop polling behind the screen the user is actually looking at.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffectSafe(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
