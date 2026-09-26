import { useMemo } from 'react';
import { useDialog } from '@/components/base/dialogContext';

export function useAppFeedback() {
  const dialog = useDialog();

  // Memoized on `dialog` (stable) so callers can use this as an effect dep.
  return useMemo(
    () => ({
      alert: dialog.alert,
      input: dialog.input,
      toast: dialog.toast,
      error(message: string, title = 'Something went wrong') {
        dialog.alert({ title, message, buttons: [{ text: 'OK' }] });
      },
    }),
    [dialog],
  );
}
