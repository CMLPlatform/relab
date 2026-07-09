import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Button, Dialog, HelperText, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import {
  type DialogButton,
  DialogContext,
  type DialogContextType,
  type DialogOptions,
} from './dialogContext';

export function DialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dialogVersion, setDialogVersion] = useState(0);

  const alert = useCallback<DialogContextType['alert']>((options: DialogOptions) => {
    setOptions({ ...options, input: false });
    setDialogVersion((version) => version + 1);
  }, []);

  const input = useCallback<DialogContextType['input']>((options: DialogOptions) => {
    setOptions({ ...options, input: true });
    setDialogVersion((version) => version + 1);
  }, []);

  const toast = useCallback<DialogContextType['toast']>((message: string) => {
    setToastMessage(message);
  }, []);

  const clear = useCallback(() => {
    setOptions(null);
  }, []);

  const dismissToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const contextValue = useMemo(() => ({ alert, input, toast }), [alert, input, toast]);

  return (
    <DialogContext.Provider value={contextValue}>
      {children}

      <Portal>
        {/* key remounts the body per dialog so the input resets to its defaultValue. */}
        <DialogBody key={dialogVersion} options={options} onDismiss={clear} />
      </Portal>
      <Snackbar visible={Boolean(toastMessage)} onDismiss={dismissToast} duration={3000}>
        {toastMessage ?? ''}
      </Snackbar>
    </DialogContext.Provider>
  );
}

function DialogBody({
  options,
  onDismiss,
}: {
  options: DialogOptions | null;
  onDismiss: () => void;
}) {
  const [inputValue, setInputValue] = useState(options?.defaultValue || '');

  const isButtonDisabled = useCallback(
    (button: DialogButton) => {
      if (typeof button.disabled === 'function') {
        return button.disabled(inputValue);
      }
      return button.disabled ?? false;
    },
    [inputValue],
  );

  // Every action — on-screen press, keyboard return — routes through here, so the
  // disabled gate lives here rather than at each entry point. Paper's `disabled`
  // prop still greys the button out; this is what stops it firing.
  const handleClose = useCallback(
    (btn?: DialogButton) => {
      if (btn && isButtonDisabled(btn)) {
        return;
      }
      if (btn?.onPress) {
        btn.onPress(options?.input ? inputValue : undefined);
      }
      setInputValue('');
      onDismiss();
    },
    [inputValue, isButtonDisabled, onDismiss, options?.input],
  );

  const buttons = useMemo(() => options?.buttons ?? [{ text: 'OK' }], [options?.buttons]);

  // Enter submits the primary (last) action.
  const handleSubmitEditing = useCallback(() => {
    handleClose(buttons[buttons.length - 1]);
  }, [handleClose, buttons]);

  return (
    <Dialog visible={Boolean(options)} onDismiss={onDismiss}>
      {options?.title ? <Dialog.Title>{options.title}</Dialog.Title> : null}
      <Dialog.Content>
        {options?.message ? <Text variant="bodyMedium">{options.message}</Text> : null}

        {options?.input ? (
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={handleSubmitEditing}
            placeholder={options.placeholder}
            error={options.error}
            autoFocus
          />
        ) : null}

        {options?.input && options?.helperText ? (
          <HelperText type={options.error ? 'error' : 'info'} visible>
            {options.helperText}
          </HelperText>
        ) : null}
      </Dialog.Content>
      <Dialog.Actions>
        {buttons.map((btn) => (
          <DialogActionButton
            key={btn.text}
            button={btn}
            onSelect={handleClose}
            disabled={isButtonDisabled(btn)}
          />
        ))}
      </Dialog.Actions>
    </Dialog>
  );
}

function DialogActionButton({
  button,
  onSelect,
  disabled,
}: {
  button: DialogButton;
  onSelect: (btn: DialogButton) => void;
  disabled: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelect(button);
  }, [onSelect, button]);

  return (
    <Button onPress={handlePress} disabled={disabled}>
      {button.text}
    </Button>
  );
}
