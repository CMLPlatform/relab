import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';

type DialogButton = {
  text: string;
  onPress?: (value?: string) => void;
  disabled?: boolean | ((value: string) => boolean);
};

type DialogOptions = {
  title?: string;
  message?: string;
  buttons?: DialogButton[];
  input?: boolean;
  defaultValue?: string;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
};

type DialogContextType = {
  alert: (options: DialogOptions) => void;
  input: (options: DialogOptions) => void;
  toast: (message: string) => void;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function useOptionalDialog() {
  return useContext(DialogContext);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  // States
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Context functions
  const alert: DialogContextType['alert'] = (options: DialogOptions) => {
    setOptions({ ...options, input: false });
  };

  const input: DialogContextType['input'] = (options: DialogOptions) => {
    setOptions({ ...options, input: true });
  };

  const toast: DialogContextType['toast'] = (message: string) => {
    setToastMessage(message);
  };

  // Callbacks
  const clear = () => {
    setOptions(null);
  };

  // Render
  return (
    <DialogContext.Provider value={{ alert, input, toast }}>
      {children}

      <Modal visible={!!options} transparent onRequestClose={clear}>
        <Pressable style={styles.backdrop} onPress={clear}>
          <Dialog options={options} onDismiss={clear} />
        </Pressable>
      </Modal>
      <Snackbar visible={!!toastMessage} onDismiss={() => setToastMessage(null)} duration={3000}>
        {toastMessage ?? ''}
      </Snackbar>
    </DialogContext.Provider>
  );
}

function Dialog({ options, onDismiss }: { options: DialogOptions | null; onDismiss?: () => void }) {
  // Hooks
  const theme = useTheme();

  // States — reset when options change (e.g. opening a new dialog)
  const [inputValue, setInputValue] = useState(options?.defaultValue || '');
  useEffect(() => {
    setInputValue(options?.defaultValue || '');
  }, [options]);

  // Callbacks
  const handleClose = (btn?: DialogButton) => {
    if (btn?.onPress) {
      btn.onPress(options?.input ? inputValue : undefined);
    }
    setInputValue('');
    onDismiss?.();
  };

  // Methods
  const isButtonDisabled = (button: DialogButton) => {
    if (typeof button.disabled === 'function') {
      return button.disabled(inputValue);
    }
    return button.disabled ?? false;
  };

  // Render
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
          onSubmitEditing={() =>
            handleClose(options?.buttons ? options.buttons[options.buttons.length - 1] : undefined)
          }
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
        {(options?.buttons || [{ text: 'OK' }]).map((btn) => (
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  buttonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    marginBottom: 8,
  },
});
