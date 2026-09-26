import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { DialogContext } from '@/components/base/dialogContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';

function renderWithDialog() {
  const dialog = { alert: jest.fn(), toast: jest.fn(), input: jest.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DialogContext.Provider value={dialog}>{children}</DialogContext.Provider>
  );
  return { dialog, render: () => renderHook(() => useAppFeedback(), { wrapper }) };
}

describe('useAppFeedback', () => {
  it('routes alerts, toasts and inputs through the dialog', async () => {
    const { dialog, render } = renderWithDialog();
    const { result } = await render();

    result.current.alert({ title: 'Heads up', message: 'Saved', buttons: [{ text: 'OK' }] });
    result.current.toast('Hello');
    result.current.error('Boom');
    result.current.input({});

    expect(dialog.alert).toHaveBeenNthCalledWith(1, {
      title: 'Heads up',
      message: 'Saved',
      buttons: [{ text: 'OK' }],
    });
    expect(dialog.toast).toHaveBeenCalledWith('Hello');
    expect(dialog.alert).toHaveBeenNthCalledWith(2, {
      title: 'Something went wrong',
      message: 'Boom',
      buttons: [{ text: 'OK' }],
    });
    expect(dialog.input).toHaveBeenCalled();
  });

  it('forwards a toast action to the dialog', async () => {
    const { dialog, render } = renderWithDialog();
    const onPress = jest.fn();

    const { result } = await render();
    result.current.toast('Photo removed', { label: 'Undo', onPress });

    expect(dialog.toast).toHaveBeenCalledWith('Photo removed', { label: 'Undo', onPress });
  });
});
