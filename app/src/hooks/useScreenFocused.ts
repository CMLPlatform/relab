import { NavigationContext } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useContext, useEffect, useState } from 'react';

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

/**
 * Like {@link useScreenFocused} but safe to call outside a navigator: returns
 * `true` when there is no enclosing navigation screen (e.g. a dialog rendered
 * above the navigator). `useFocusEffect` throws off-navigator, whereas reading
 * the navigation context does not — so a hook shared by both screen and
 * non-screen callers can still gate on focus.
 */
export function useScreenFocusedSafe(): boolean {
  const navigation = useContext(NavigationContext);
  // Seeded from the current focus at mount; the listeners carry it from there.
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const unsubscribeFocus = navigation.addListener('focus', () => setFocused(true));
    const unsubscribeBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);
  return focused;
}
