import { useMemo } from 'react';
import {
  type DialogButton,
  pickSubmitButton,
  type ToastAction,
  useOptionalDialog,
} from '@/components/base/dialogContext';

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
    // Without a provider there is nowhere to put the action, so the fallback
    // shows the message alone — the caller's change stands, exactly as it does
    // when the toast auto-dismisses unactioned.
    const toast = (message: string, action?: ToastAction) =>
      dialog ? dialog.toast(message, action) : fallbackAlert(message);
    return {
      alert: (options: { message?: string; title?: string; buttons?: DialogButton[] }) => {
        if (dialog) {
          dialog.alert(options);
          return;
        }
        fallbackAlert(options.message ?? options.title ?? '');
        // Same button DialogProvider's Enter key would submit: the last non-destructive,
        // non-cancel action. A destructive-only button set must not auto-fire here either.
        pickSubmitButton(options.buttons ?? [])?.onPress?.();
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
