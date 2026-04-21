import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Snackbar, Text, TextInput } from 'react-native-paper';
import {
  type DialogButton,
  DialogContext,
  type DialogContextType,
  type DialogOptions,
} from '@/components/common/dialogContext';
import { useAppTheme } from '@/theme';

export function DialogProvider({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
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

      <Modal visible={Boolean(options)} transparent onRequestClose={clear}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: theme.tokens.overlay.scrim }]}
          onPress={clear}
        >
          <Dialog key={dialogVersion} options={options} onDismiss={clear} />
        </Pressable>
      </Modal>
      <Snackbar visible={Boolean(toastMessage)} onDismiss={dismissToast} duration={3000}>
        {toastMessage ?? ''}
      </Snackbar>
    </DialogContext.Provider>
  );
}

function Dialog({ options, onDismiss }: { options: DialogOptions | null; onDismiss?: () => void }) {
  const theme = useAppTheme();
  const [inputValue, setInputValue] = useState(options?.defaultValue || '');

  const handleClose = useCallback(
    (btn?: DialogButton) => {
      if (btn?.onPress) {
        btn.onPress(options?.input ? inputValue : undefined);
      }
      setInputValue('');
      onDismiss?.();
    },
    [inputValue, onDismiss, options?.input],
  );

  const isButtonDisabled = useCallback(
    (button: DialogButton) => {
      if (typeof button.disabled === 'function') {
        return button.disabled(inputValue);
      }
      return button.disabled ?? false;
    },
    [inputValue],
  );

  const buttons = options?.buttons ?? [{ text: 'OK' }];

  return (
    <Pressable
      style={{ backgroundColor: theme.colors.surface, ...styles.container }}
      onPress={(e) => e.stopPropagation()}
    >
      {options?.title && <Text style={styles.title}>{options.title}</Text>}
      {options?.message && <Text style={styles.message}>{options.message}</Text>}

      {options?.input && (
        <TextInput
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={() => handleClose(buttons[buttons.length - 1])}
          placeholder={options.placeholder}
          error={options.error}
          autoFocus
        />
      )}

      {options?.input && options?.helperText && (
        <Text style={[styles.helperText, options.error && { color: theme.colors.error }]}>
          {options.helperText}
        </Text>
      )}

      <View style={styles.buttonRow}>
        {buttons.map((btn) => (
          <Button
            key={btn.text}
            onPress={() => handleClose(btn)}
            disabled={isButtonDisabled(btn)}
            style={styles.button}
          >
            {btn.text}
          </Button>
        ))}
      </View>
    </Pressable>
  );
}

// TODO: put common styling in global stylesheet
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    borderRadius: 12,
    padding: 20,
    paddingBottom: 0,
    width: '90%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 18,
  },
  message: {
    fontSize: 15,
    opacity: 0.7,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 15,
    marginLeft: 8,
  },
  helperText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    marginBottom: 8,
  },
});
