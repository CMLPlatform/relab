import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Whether the enclosing navigation screen is currently focused.
 *
 * Polling queries gate their `subscribed` flag on this, so stacked screens stop
 * polling behind the screen the user is actually looking at.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
