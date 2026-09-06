import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';

/** `useIsFocused` that returns `true` outside a navigator instead of throwing. */
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
