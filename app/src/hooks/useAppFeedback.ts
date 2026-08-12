import { useMemo } from 'react';
import { useOptionalDialog } from '@/components/base/dialogContext';

function fallbackAlert(message: string) {
  if (typeof globalThis.alert === 'function') {
    globalThis.alert(message);
  }
}

export function useAppFeedback() {
  const dialog = useOptionalDialog();

  // Memoized on `dialog` (referentially stable per DialogProvider's own useMemo) so
  // callers that pass `toast`/the whole feedback object as a useCallback/useEffect dep
  // don't get a new identity every render.
  return useMemo(() => {
    const toast = (message: string) => (dialog ? dialog.toast(message) : fallbackAlert(message));
    return {
      alert: (options: {
        message?: string;
        title?: string;
        buttons?: { text: string; onPress?: () => void }[];
      }) => {
        if (dialog) {
          dialog.alert(options);
          return;
        }
        fallbackAlert(options.message ?? options.title ?? '');
        // Last button is the primary action, same convention DialogProvider's Enter key uses.
        // Matching on the label 'Cancel' instead would auto-fire a dismiss spelled 'No'.
        const primary = options.buttons?.at(-1);
        primary?.onPress?.();
      },
      input: dialog?.input ?? (() => {}),
      toast,
      success: toast,
      error(message: string, title = 'Something went wrong') {
        if (dialog) {
          dialog.alert({ title, message, buttons: [{ text: 'OK' }] });
          return;
        }
        fallbackAlert(message);
      },
    };
  }, [dialog]);
}
