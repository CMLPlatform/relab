import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDialog } from '@/components/base/dialogContext';
import { mockPlatform, renderWithProviders, restorePlatform, setupUser } from '@/test-utils/index';

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  findNodeHandle: jest.fn(() => 7),
}));

const mockedFindNodeHandle = jest.mocked(findNodeHandle);

function renderAlertTrigger(onPress: () => void) {
  return (
    <Pressable testID="trigger" onPress={onPress}>
      <Text>Open Alert</Text>
    </Pressable>
  );
}

// DialogProvider tests must use withDialog: true to wrap the UI in DialogProvider.
// We pass a *custom* wrapper here because DialogProvider-test needs the DialogProvider
// context to be available to the components under test; which renderWithProviders
// provides when withDialog: true is set.

describe('DialogProvider', () => {
  const user = setupUser();

  afterEach(() => {
    restorePlatform();
  });

  it('renders children without showing a dialog by default', () => {
    renderWithProviders(<Text>Hello World</Text>, { withDialog: true });
    expect(screen.getByText('Hello World')).toBeOnTheScreen();
  });

  it('useDialog throws when used outside DialogProvider', () => {
    function BadConsumer() {
      useDialog();
      return <Text>Should not render</Text>;
    }
    expect(() => renderWithProviders(<BadConsumer />)).toThrow(
      'useDialog must be used within DialogProvider',
    );
  });

  it('alert() shows dialog with title', async () => {
    function AlertTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.alert({ title: 'Alert Title', buttons: [{ text: 'OK' }] }),
      );
    }

    renderWithProviders(<AlertTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Alert Title')).toBeOnTheScreen();
    expect(screen.getByText('OK')).toBeOnTheScreen();
  });

  it('alert() shows dialog with message', async () => {
    function MessageTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.alert({ title: 'Title', message: 'Some message', buttons: [{ text: 'Close' }] }),
      );
    }

    renderWithProviders(<MessageTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Some message')).toBeOnTheScreen();
  });

  it('input() shows dialog with TextInput', async () => {
    function InputTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.input({
          title: 'Input Dialog',
          placeholder: 'Type something...',
          buttons: [{ text: 'Submit' }],
        }),
      );
    }

    renderWithProviders(<InputTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Input Dialog')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Type something...')).toBeOnTheScreen();
  });

  it('input() dialog onPress callback receives the typed value', async () => {
    const onSubmit = jest.fn();

    function InputTypingTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.input({
          title: 'Enter Name',
          placeholder: 'Your name',
          buttons: [{ text: 'Submit', onPress: onSubmit }],
        }),
      );
    }

    renderWithProviders(<InputTypingTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    await user.type(screen.getByPlaceholderText('Your name'), 'hello world');

    await user.press(screen.getByText('Submit'));

    expect(onSubmit).toHaveBeenCalledWith('hello world');
  });

  it('threads options.triggerRef through to AppDialog for native focus restore', async () => {
    mockPlatform('ios');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => {});
    const triggerRef = createRef<View>();
    // Only resolves a handle for the externally-supplied ref, so a stray internal
    // (unattached) ref inside AppDialog can't make this pass by accident.
    mockedFindNodeHandle.mockImplementation((component) =>
      component === triggerRef.current ? 7 : null,
    );

    function TriggerRefTest() {
      const dialog = useDialog();
      return (
        <>
          <View ref={triggerRef} />
          {renderAlertTrigger(() =>
            dialog.input({
              title: 'Edit name',
              placeholder: 'Name',
              triggerRef,
              buttons: [{ text: 'Cancel', style: 'cancel' }],
            }),
          )}
        </>
      );
    }

    renderWithProviders(<TriggerRefTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('Edit name')).toBeOnTheScreen();

    await user.press(screen.getByText('Cancel'));

    expect(setFocus).toHaveBeenCalledWith(7);
  });

  it('dialog button onPress callback is called with value for alert', async () => {
    const onConfirm = jest.fn();

    function AlertTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.alert({
          title: 'Confirm',
          buttons: [{ text: 'Yes', onPress: onConfirm }],
        }),
      );
    }

    renderWithProviders(<AlertTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    await user.press(screen.getByText('Yes'));

    expect(onConfirm).toHaveBeenCalledWith(undefined); // alert mode → undefined value
  });

  it('pressing submit on the input keyboard calls handleClose with the last button', async () => {
    const onSubmit = jest.fn();

    function InputSubmitTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.input({
          title: 'Enter Name',
          placeholder: 'Your name',
          buttons: [{ text: 'Cancel' }, { text: 'OK', onPress: onSubmit }],
        }),
      );
    }

    renderWithProviders(<InputSubmitTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    await user.type(screen.getByPlaceholderText('Your name'), 'hello');
    // submitEditing is a custom event not supported by userEvent
    fireEvent(screen.getByPlaceholderText('Your name'), 'submitEditing');

    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('submitEditing does not fire the primary action while it is disabled', async () => {
    const onSubmit = jest.fn();

    function DisabledSubmitTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.input({
          title: 'Enter Name',
          placeholder: 'Your name',
          buttons: [
            { text: 'Cancel' },
            { text: 'OK', onPress: onSubmit, disabled: (v) => !v.trim() },
          ],
        }),
      );
    }

    renderWithProviders(<DisabledSubmitTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    // Field is empty → OK's disabled gate is active; pressing Enter must not bypass it.
    fireEvent(screen.getByPlaceholderText('Your name'), 'submitEditing');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('default OK button renders when no buttons provided', async () => {
    function DefaultTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.alert({ title: 'No Buttons' }));
    }

    renderWithProviders(<DefaultTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    expect(screen.getByText('OK')).toBeOnTheScreen();
  });

  it('toast() shows a transient snackbar message', async () => {
    function ToastTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.toast('Saved'));
    }

    renderWithProviders(<ToastTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Saved')).toBeOnTheScreen();
  });

  it('dialog actions remain callable after the consumer rerenders', async () => {
    function AlertTest({ title }: { title: string }) {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.alert({ title, buttons: [{ text: 'OK' }] }));
    }

    const view = renderWithProviders(<AlertTest title="First Title" />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('First Title')).toBeOnTheScreen();
    await user.press(screen.getByText('OK'));

    view.rerender(<AlertTest title="Second Title" />);

    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('Second Title')).toBeOnTheScreen();
  });

  it('pressing a button with no onPress closes the dialog without throwing', async () => {
    function Test() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.alert({ title: 'Plain', buttons: [{ text: 'OK' }] }));
    }

    renderWithProviders(<Test />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    await user.press(screen.getByText('OK'));
  });

  it('submitEditing on input with no buttons calls handleClose without crashing', async () => {
    function Test() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.input({ title: 'No-Button Input', placeholder: 'type here' }),
      );
    }

    renderWithProviders(<Test />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    // submitEditing is a custom event not supported by userEvent
    fireEvent(screen.getByPlaceholderText('type here'), 'submitEditing');
  });

  it('pressing Cancel dismisses the dialog without invoking the confirm action', async () => {
    const onConfirm = jest.fn();

    function CancelTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.alert({
          title: 'Discard changes?',
          buttons: [{ text: 'Cancel' }, { text: 'Discard', onPress: onConfirm }],
        }),
      );
    }

    renderWithProviders(<CancelTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();

    await user.press(screen.getByText('Cancel'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('toast() auto-dismisses after its duration and announces via aria-live without a Modal', async () => {
    function ToastTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.toast('Saved'));
    }

    renderWithProviders(<ToastTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    const toastText = screen.getByText('Saved');
    expect(toastText).toBeOnTheScreen();
    expect(toastText).toHaveProp('accessibilityLiveRegion', 'polite');

    // A toast must not steal focus or block the rest of the screen — the
    // trigger stays pressable while the toast is showing.
    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('Saved')).toBeOnTheScreen();

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    await waitFor(() => {
      expect(screen.queryByText('Saved')).toBeNull();
    });
  });

  it('repeating the same toast message resets the dismiss timer', async () => {
    function ToastTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.toast('Saved'));
    }

    renderWithProviders(<ToastTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('Saved')).toBeOnTheScreen();

    // ~3s in, fire the identical message again — the 4s timer must restart.
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    await user.press(screen.getByTestId('trigger'));

    // 2s after the second fire (5s after the first): still visible.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Saved')).toBeOnTheScreen();

    // And it still auto-dismisses 4s after the second fire.
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    await waitFor(() => {
      expect(screen.queryByText('Saved')).toBeNull();
    });
  });

  it('toast() renders its optional action and dismisses when the action fires', async () => {
    const onPress = jest.fn();
    function ToastTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.toast('Photo removed', { label: 'Undo', onPress }));
    }

    renderWithProviders(<ToastTest />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));
    expect(screen.getByText('Photo removed')).toBeOnTheScreen();

    // The Inverse-Pair Rule, asserted on the paint rather than the class: the
    // action label must carry the same ink as the message it sits beside. The
    // button variant's own foreground assumes a same-polarity surface, and
    // letting it through is the failure that made ActiveStreamBanner invisible.
    const messageColor = StyleSheet.flatten(screen.getByText('Photo removed').props.style)?.color;
    const actionColor = StyleSheet.flatten(screen.getByText('Undo').props.style)?.color;
    expect(actionColor).toBe(messageColor);
    expect(actionColor).toBeTruthy();

    await user.press(screen.getByText('Undo'));

    expect(onPress).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Photo removed')).toBeNull();
    });
  });

  // A toast with a control gets longer than the 4s plain one: the reader has to
  // notice it, read it and reach the button before it goes.
  it('a toast with an action outlives the plain 4s dismiss', async () => {
    function ToastTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() =>
        dialog.toast('Photo removed', { label: 'Undo', onPress: () => {} }),
      );
    }

    renderWithProviders(<ToastTest />, { withDialog: true });
    await user.press(screen.getByTestId('trigger'));

    act(() => {
      jest.advanceTimersByTime(4100);
    });
    expect(screen.getByText('Undo')).toBeOnTheScreen();

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    await waitFor(() => {
      expect(screen.queryByText('Photo removed')).toBeNull();
    });
  });

  it('toast() announces on iOS, where accessibilityLiveRegion does nothing', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    function ToastTest() {
      const dialog = useDialog();
      return renderAlertTrigger(() => dialog.toast('Saved'));
    }

    renderWithProviders(<ToastTest />, { withDialog: true });
    await user.press(screen.getByTestId('trigger'));

    expect(announce).toHaveBeenCalledWith('Saved');
    announce.mockRestore();
  });
});
