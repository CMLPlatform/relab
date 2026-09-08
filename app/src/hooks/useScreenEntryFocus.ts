import { useEffect, useRef } from 'react';
import { Platform, type View } from 'react-native';
import { useScreenFocusedSafe } from './useScreenFocused';

/**
 * Web only: when a screen gains focus (first render, forward navigation, back),
 * move keyboard focus to its h1, else to the scaffold itself. Without this the
 * browser leaves focus on <body> after every route change, so screen-reader and
 * keyboard users restart from the top of the document. Attach the ref to the
 * screen's scaffold View; no-op on native.
 */
export function useScreenEntryFocus() {
  const ref = useRef<View>(null);
  const focused = useScreenFocusedSafe();

  useEffect(() => {
    if (Platform.OS !== 'web' || !focused) return;
    // Next frame: the screen's DOM is committed and any exit transition has
    // released focus by then.
    const frame = requestAnimationFrame(() => {
      const root = ref.current as unknown as HTMLElement | null;
      if (!root) return;
      const target = root.querySelector<HTMLElement>('h1') ?? root;
      target.tabIndex = -1;
      target.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focused]);

  return ref;
}
