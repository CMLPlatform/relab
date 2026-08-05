import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, type View } from 'react-native';

/**
 * Returns screen-reader focus to the control that opened an overlay once it closes.
 *
 * Dismissing a `Modal` otherwise drops focus back to the top of the underlying
 * screen, stranding a screen-reader user far from where they were (WCAG 2.4.3).
 *
 * On web the DOM element that had focus when the overlay opened is captured and
 * refocused on close. react-native-web's `ModalFocusTrap` does this too, but only
 * when the whole `Modal` unmounts — overlays that stay mounted and toggle
 * `visible` (most of ours) never trigger it.
 *
 * On native there is no way to read what had accessibility focus, so the caller
 * must attach the returned ref to the trigger; without it the native branch is a
 * no-op.
 */
export function useReturnFocus(visible: boolean) {
  const triggerRef = useRef<View | null>(null);
  const wasVisible = useRef(visible);
  const [renderedVisible, setRenderedVisible] = useState(visible);
  const [webTrigger, setWebTrigger] = useState<HTMLElement | null>(null);
  const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';

  // Captured during render, not in an effect: children commit — and `autoFocus`
  // inputs claim focus — before the parent's effect runs, by which point
  // document.activeElement already points inside the overlay.
  if (visible !== renderedVisible) {
    setRenderedVisible(visible);
    if (isWeb && visible) setWebTrigger(document.activeElement as HTMLElement | null);
  }

  useEffect(() => {
    const justClosed = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (!justClosed) return;

    if (isWeb) {
      // Not cleared afterwards — the next open overwrites it.
      if (webTrigger?.isConnected) webTrigger.focus();
      return;
    }

    const handle = findNodeHandle(triggerRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [visible, isWeb, webTrigger]);

  return triggerRef;
}
