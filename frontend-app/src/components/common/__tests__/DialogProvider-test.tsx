import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useDialog } from '../DialogProvider';
import { renderWithProviders } from '@/test-utils';

// A test component that exposes dialog controls
function AlertTrigger({ onPress }: { onPress: () => void }) {
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
  it('renders children without showing a dialog by default', () => {
    renderWithProviders(<Text>Hello World</Text>, { withDialog: true });
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('useDialog throws when used outside DialogProvider', () => {
    function BadConsumer() {
      useDialog();
      return <Text>Should not render</Text>;
    }
    expect(() => renderWithProviders(<BadConsumer />)).toThrow('useDialog must be used within DialogProvider');
  });

  it('alert() shows dialog with title', async () => {
    function AlertTest() {
      const dialog = useDialog();
      return <AlertTrigger onPress={() => dialog.alert({ title: 'Alert Title', buttons: [{ text: 'OK' }] })} />;
    }

    renderWithProviders(<AlertTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Alert Title')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('alert() shows dialog with message', async () => {
    function MessageTest() {
      const dialog = useDialog();
      return (
        <AlertTrigger
          onPress={() => dialog.alert({ title: 'Title', message: 'Some message', buttons: [{ text: 'Close' }] })}
        />
      );
    }

    renderWithProviders(<MessageTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Some message')).toBeTruthy();
  });

  it('input() shows dialog with TextInput', async () => {
    function InputTest() {
      const dialog = useDialog();
      return (
        <AlertTrigger
          onPress={() =>
            dialog.input({
              title: 'Input Dialog',
              placeholder: 'Type something...',
              buttons: [{ text: 'Submit' }],
            })
          }
        />
      );
    }

    renderWithProviders(<InputTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    expect(screen.getByText('Input Dialog')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type something...')).toBeTruthy();
  });

  it('input() dialog onPress callback receives the typed value', async () => {
    const onSubmit = jest.fn();

    function InputTypingTest() {
      const dialog = useDialog();
      return (
        <AlertTrigger
          onPress={() =>
            dialog.input({
              title: 'Enter Name',
              placeholder: 'Your name',
              buttons: [{ text: 'Submit', onPress: onSubmit }],
            })
          }
        />
      );
    }

    renderWithProviders(<InputTypingTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'hello world');

    fireEvent.press(screen.getByText('Submit'));

    expect(onSubmit).toHaveBeenCalledWith('hello world');
  });

  it('dialog button onPress callback is called with value for alert', async () => {
    const onConfirm = jest.fn();

    function AlertTest() {
      const dialog = useDialog();
      return (
        <AlertTrigger
          onPress={() =>
            dialog.alert({
              title: 'Confirm',
              buttons: [{ text: 'Yes', onPress: onConfirm }],
            })
          }
        />
      );
    }

    renderWithProviders(<AlertTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    fireEvent.press(screen.getByText('Yes'));

    expect(onConfirm).toHaveBeenCalledWith(undefined); // alert mode → undefined value
  });

  it('pressing submit on the input keyboard calls handleClose with the last button', async () => {
    const onSubmit = jest.fn();

    function InputSubmitTest() {
      const dialog = useDialog();
      return (
        <AlertTrigger
          onPress={() =>
            dialog.input({
              title: 'Enter Name',
              placeholder: 'Your name',
              buttons: [{ text: 'Cancel' }, { text: 'OK', onPress: onSubmit }],
            })
          }
        />
      );
    }

    renderWithProviders(<InputSubmitTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'hello');
    fireEvent(screen.getByPlaceholderText('Your name'), 'submitEditing');

    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('default OK button renders when no buttons provided', async () => {
    function DefaultTest() {
      const dialog = useDialog();
      return <AlertTrigger onPress={() => dialog.alert({ title: 'No Buttons' })} />;
    }

    renderWithProviders(<DefaultTest />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('pressing a button with no onPress closes the dialog without throwing', async () => {
    // Covers the false branch of `if (btn?.onPress)` in handleClose
    function Test() {
      const dialog = useDialog();
      return <AlertTrigger onPress={() => dialog.alert({ title: 'Plain', buttons: [{ text: 'OK' }] })} />;
    }

    renderWithProviders(<Test />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    // Press the button that has no onPress; should not throw
    fireEvent.press(screen.getByText('OK'));
  });

  it('submitEditing on input with no buttons calls handleClose without crashing', async () => {
    // Covers the false branch of `options?.buttons ? ... : undefined` in onSubmitEditing
    function Test() {
      const dialog = useDialog();
      return <AlertTrigger onPress={() => dialog.input({ title: 'No-Button Input', placeholder: 'type here' })} />;
    }

    renderWithProviders(<Test />, { withDialog: true });

    fireEvent.press(screen.getByTestId('trigger'));

    // Submit without any buttons; handleClose(undefined) should not throw
    fireEvent(screen.getByPlaceholderText('type here'), 'submitEditing');
  });
});
