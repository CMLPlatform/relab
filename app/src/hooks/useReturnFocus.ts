import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';

/**
 * Returns screen-reader focus to the control that opened an overlay once it closes.
 *
 * On iOS and Android, dismissing a `Modal` drops focus back to the top of the
 * underlying screen, stranding a screen-reader user far from where they were
 * (WCAG 2.4.3). On web this is already handled: react-native-web's
 * `ModalFocusTrap` refocuses the triggering element on unmount, and its
 * `setAccessibilityFocus` is a no-op, so no platform branch is needed here.
 *
 * Attach the returned ref to the trigger and pass the overlay's visibility.
 */
export function useReturnFocus(visible: boolean) {
  const triggerRef = useRef<View | null>(null);
  const wasVisible = useRef(visible);

  useEffect(() => {
    const justClosed = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (!justClosed) return;

    const handle = findNodeHandle(triggerRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [visible]);

  return triggerRef;
}
