import { useEffect } from 'react';
import { Platform } from 'react-native';

const MODAL_WRAPPER_SELECTOR = '[data-testid="modal-wrapper"]';
const MODAL_BACKDROP_SELECTOR = '[data-testid="modal-backdrop"]';
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * react-native-paper's web Dialog is built on its own Modal (not RN's) — its
 * own source notes "this modal is NOT accessible by default": no Escape-to-
 * dismiss, no focus trap. Every open Paper dialog shares one DOM landmark
 * (data-testid="modal-wrapper"/"modal-backdrop", from Modal.js's default
 * testID), so one global listener covers every dialog in the app instead of
 * wrapping each call site.
 */
export function useGlobalDialogA11y() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    function handleKeyDown(event: KeyboardEvent) {
      const wrapper = document.querySelector<HTMLElement>(MODAL_WRAPPER_SELECTOR);
      if (!wrapper) return;

      if (event.key === 'Escape') {
        document.querySelector<HTMLElement>(MODAL_BACKDROP_SELECTOR)?.click();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        wrapper.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!(active && wrapper.contains(active))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
