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

  // Memoized on `dialog` (stable) so callers can use this as an effect dep.
  return useMemo(() => {
    // Without a provider the fallback shows the message alone.
    const toast = (message: string, action?: ToastAction) =>
      dialog ? dialog.toast(message, action) : fallbackAlert(message);
    return {
      alert: (options: { message?: string; title?: string; buttons?: DialogButton[] }) => {
        if (dialog) {
          dialog.alert(options);
          return;
        }
        fallbackAlert(options.message ?? options.title ?? '');
        // Same button DialogProvider's Enter key would submit.
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
