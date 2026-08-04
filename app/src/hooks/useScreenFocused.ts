import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';

/**
 * Like `useIsFocused` (from `expo-router`) but safe to call outside a navigator: returns
 * `true` when there is no enclosing navigation screen (e.g. a dialog rendered
 * above the navigator). `useIsFocused` throws off-navigator, whereas reading
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
