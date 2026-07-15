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

    // Paper mounts/unmounts the modal-wrapper node rather than toggling its
    // visibility, so a MutationObserver on the body is how we notice a
    // dialog opening or closing without threading dialog state through every
    // call site (same DOM-query approach as handleKeyDown below).
    let trigger: HTMLElement | null = null;
    const focusObserver = new MutationObserver(() => {
      const wrapper = document.querySelector<HTMLElement>(MODAL_WRAPPER_SELECTOR);
      if (wrapper && !trigger) {
        trigger = document.activeElement as HTMLElement | null;
      } else if (!wrapper && trigger) {
        if (document.contains(trigger) && typeof trigger.focus === 'function') {
          trigger.focus();
        }
        trigger = null;
      }
    });
    focusObserver.observe(document.body, { childList: true, subtree: true });

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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      focusObserver.disconnect();
    };
  }, []);
}
