import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useOptionalDialog } from '@/components/common/dialogContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
  );
  return {
    ...actual,
    useOptionalDialog: jest.fn(),
  };
});

const mockUseOptionalDialog = jest.mocked(useOptionalDialog);

describe('useAppFeedback', () => {
  const alertSpy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.alert = alertSpy;
  });

  it('routes alerts and toasts through the dialog when available', () => {
    const dialog = {
      alert: jest.fn(),
      toast: jest.fn(),
      input: jest.fn(),
    };
    mockUseOptionalDialog.mockReturnValue(dialog as never);

    const { result } = renderHook(() => useAppFeedback());

    result.current.alert({ title: 'Heads up', message: 'Saved', buttons: [{ text: 'OK' }] });
    result.current.toast('Hello');
    result.current.success('Done');
    result.current.error('Boom');
    result.current.input({});

    expect(dialog.alert).toHaveBeenNthCalledWith(1, {
      title: 'Heads up',
      message: 'Saved',
      buttons: [{ text: 'OK' }],
    });
    expect(dialog.toast).toHaveBeenNthCalledWith(1, 'Hello');
    expect(dialog.toast).toHaveBeenNthCalledWith(2, 'Done');
    expect(dialog.alert).toHaveBeenNthCalledWith(2, {
      title: 'Something went wrong',
      message: 'Boom',
      buttons: [{ text: 'OK' }],
    });
    expect(dialog.input).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('falls back to global alert and invokes the first non-cancel action', () => {
    const primaryAction = jest.fn();
    mockUseOptionalDialog.mockReturnValue(undefined);

    const { result } = renderHook(() => useAppFeedback());

    result.current.alert({
      title: 'Delete item?',
      message: 'This cannot be undone.',
      buttons: [{ text: 'Cancel' }, { text: 'Delete', onPress: primaryAction }],
    });

    expect(alertSpy).toHaveBeenCalledWith('This cannot be undone.');
    expect(primaryAction).toHaveBeenCalled();
  });

  it('falls back to title when message is omitted and exposes no-op input', () => {
    mockUseOptionalDialog.mockReturnValue(undefined);

    const { result } = renderHook(() => useAppFeedback());

    expect(() => result.current.input({})).not.toThrow();

    result.current.alert({
      title: 'Needs attention',
      buttons: [{ text: 'OK' }],
    });
    result.current.toast('Toast fallback');
    result.current.success('Success fallback');
    result.current.error('Error fallback', 'Custom title');

    expect(alertSpy).toHaveBeenNthCalledWith(1, 'Needs attention');
    expect(alertSpy).toHaveBeenNthCalledWith(2, 'Toast fallback');
    expect(alertSpy).toHaveBeenNthCalledWith(3, 'Success fallback');
    expect(alertSpy).toHaveBeenNthCalledWith(4, 'Error fallback');
  });
});
