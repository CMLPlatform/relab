import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { Pressable, Text } from 'react-native';
import { DialogProvider, useDialog } from '../DialogProvider';

// Helper to wrap in both providers
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PaperProvider>
      <DialogProvider>{children}</DialogProvider>
    </PaperProvider>
  );
}

// A test component that exposes dialog controls
function AlertTrigger({ onPress }: { onPress: () => void }) {
  return (
    <Pressable testID="trigger" onPress={onPress}>
      <Text>Open Alert</Text>
    </Pressable>
  );
}

describe('DialogProvider', () => {
  it('renders children without showing a dialog by default', () => {
    render(
      <Wrapper>
        <Text>Hello World</Text>
      </Wrapper>,
    );
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('useDialog throws when used outside DialogProvider', () => {
    function BadConsumer() {
      useDialog();
      return <Text>Should not render</Text>;
    }
    expect(() =>
      render(
        <PaperProvider>
          <BadConsumer />
        </PaperProvider>,
      ),
    ).toThrow('useDialog must be used within DialogProvider');
  });

  it('alert() shows dialog with title', async () => {
    function AlertTest() {
      const dialog = useDialog();
      return <AlertTrigger onPress={() => dialog.alert({ title: 'Alert Title', buttons: [{ text: 'OK' }] })} />;
    }

    render(
      <Wrapper>
        <AlertTest />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });

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

    render(
      <Wrapper>
        <MessageTest />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });

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

    render(
      <Wrapper>
        <InputTest />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });

    expect(screen.getByText('Input Dialog')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type something...')).toBeTruthy();
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

    render(
      <Wrapper>
        <AlertTest />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Yes'));
    });

    expect(onConfirm).toHaveBeenCalledWith(undefined); // alert mode → undefined value
  });

  it('default OK button renders when no buttons provided', async () => {
    function DefaultTest() {
      const dialog = useDialog();
      return <AlertTrigger onPress={() => dialog.alert({ title: 'No Buttons' })} />;
    }

    render(
      <Wrapper>
        <DefaultTest />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });

    expect(screen.getByText('OK')).toBeTruthy();
  });
});
