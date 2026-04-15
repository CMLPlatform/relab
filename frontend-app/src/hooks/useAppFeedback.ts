import { useOptionalDialog } from '@/components/common/DialogProvider';

export function useAppFeedback() {
  const dialog = useOptionalDialog();
  const fallbackAlert = (message: string) => {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert(message);
    }
  };

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
      const primary =
        options.buttons?.find((button) => button.text !== 'Cancel') ?? options.buttons?.[0];
      primary?.onPress?.();
    },
    input: dialog?.input ?? (() => {}),
    toast: (message: string) => {
      if (dialog) {
        dialog.toast(message);
        return;
      }
      fallbackAlert(message);
    },
    success(message: string) {
      if (dialog) {
        dialog.toast(message);
        return;
      }
      fallbackAlert(message);
    },
    error(message: string, title = 'Something went wrong') {
      if (dialog) {
        dialog.alert({ title, message, buttons: [{ text: 'OK' }] });
        return;
      }
      fallbackAlert(message);
    },
  };
}
