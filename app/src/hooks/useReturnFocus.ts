import { type RefObject, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, type View } from 'react-native';

/**
 * Returns focus to the control that opened an overlay once it closes (WCAG 2.4.3).
 *
 * Web captures the focused DOM element on open (react-native-web's
 * `ModalFocusTrap` only does this when the Modal unmounts, and ours toggle
 * `visible`). Native cannot read accessibility focus, so the caller must
 * attach the returned ref (or pass `externalRef`) to the trigger.
 */
export function useReturnFocus(visible: boolean, externalRef?: RefObject<View | null>) {
  const internalRef = useRef<View | null>(null);
  const triggerRef = externalRef ?? internalRef;
  const wasVisible = useRef(visible);
  const [renderedVisible, setRenderedVisible] = useState(visible);
  const [webTrigger, setWebTrigger] = useState<HTMLElement | null>(null);
  const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';

  // Captured during render: `autoFocus` inputs claim focus before the parent's effect runs.
  if (visible !== renderedVisible) {
    setRenderedVisible(visible);
    if (isWeb && visible) setWebTrigger(document.activeElement as HTMLElement | null);
  }

  useEffect(() => {
    const justClosed = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (!justClosed) return;

    if (isWeb) {
      // Not cleared afterwards; the next open overwrites it.
      if (webTrigger?.isConnected) webTrigger.focus();
      return;
    }

    const handle = findNodeHandle(triggerRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    // triggerRef, not triggerRef.current (render-time ref access).
  }, [visible, isWeb, webTrigger, triggerRef]);

  return triggerRef;
}
