import { useEffect, useRef } from 'react';
import { Platform, type View } from 'react-native';
import { useScreenFocusedSafe } from './useScreenFocused';

/** About half a second at 60 fps: longer than any screen's entering fade (200ms). */
const ENTRY_FOCUS_MAX_FRAMES = 30;

/**
 * Web only: when a screen gains focus (first render, forward navigation, back),
 * move keyboard focus to its h1, else to the scaffold itself. Without this the
 * browser leaves focus on <body> after every route change, so screen-reader and
 * keyboard users restart from the top of the document. Attach the ref to the
 * screen's scaffold View; no-op on native. Pass `ready = false` while the
 * screen's h1 is still loading, so focus waits for it instead of the scaffold.
 */
export function useScreenEntryFocus(ready = true) {
  const ref = useRef<View>(null);
  const focused = useScreenFocusedSafe();

  useEffect(() => {
    if (Platform.OS !== 'web' || !focused || !ready) return;
    // Next frame: the screen's DOM is committed and any exit transition has
    // released focus by then.
    let attempts = 0;
    const tryFocus = () => {
      const root = ref.current as unknown as HTMLElement | null;
      if (!root) return;
      const target = root.querySelector<HTMLElement>('h1') ?? root;
      target.tabIndex = -1;
      // Programmatic-only focus: the target is not tabbable, so the UA ring
      // would just outline a whole heading or page column for no one.
      target.style.outline = 'none';
      target.focus();
      // A screen that fades in (the detail screen after its skeleton) is
      // `visibility: hidden` until its entering animation starts, and focus()
      // on a hidden element does nothing. Retry for a few frames, but only
      // while focus is still on the page body, so a user who already moved it keeps it.
      if (typeof document === 'undefined') return;
      const active = document.activeElement;
      const unplaced = active === null || active === document.body;
      if (active !== target && unplaced && ++attempts < ENTRY_FOCUS_MAX_FRAMES) {
        frame = requestAnimationFrame(tryFocus);
      }
    };
    let frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [focused, ready]);

  return ref;
}
