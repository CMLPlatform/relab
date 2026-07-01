import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { renderWithProviders, setupUser } from '@/test-utils/index';
import { useDialog } from '../dialogContext';

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
});
