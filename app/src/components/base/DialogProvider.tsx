import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';
import { AppText } from './AppText';
import {
  type DialogButton,
  DialogContext,
  type DialogContextType,
  type DialogOptions,
} from './dialogContext';
import { dialogActionsStyle, dialogTitleStyle } from './dialogStyles';
import { OverlaySurface } from './OverlaySurface';
import { TextInput } from './TextInput';

// Within WCAG's 3-5s auto-dismiss guidance for transient toasts.
const TOAST_DURATION_MS = 4000;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dialogVersion, setDialogVersion] = useState(0);

  const alert = useCallback<DialogContextType['alert']>((opts: DialogOptions) => {
    setOptions({ ...opts, input: false });
    setDialogVersion((version) => version + 1);
  }, []);

  const input = useCallback<DialogContextType['input']>((opts: DialogOptions) => {
    setOptions({ ...opts, input: true });
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

      {/* key remounts the body per dialog so the input resets to its defaultValue. */}
      {options ? <DialogBody key={dialogVersion} options={options} onDismiss={clear} /> : null}
      <Toast message={toastMessage} onDismiss={dismissToast} />
    </DialogContext.Provider>
  );
}

function DialogBody({ options, onDismiss }: { options: DialogOptions; onDismiss: () => void }) {
  const theme = useAppTheme();
  const [inputValue, setInputValue] = useState(options.defaultValue || '');

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
  // disabled gate lives here rather than at each entry point.
  const handleClose = useCallback(
    (btn?: DialogButton) => {
      if (btn && isButtonDisabled(btn)) {
        return;
      }
      if (btn?.onPress) {
        btn.onPress(options.input ? inputValue : undefined);
      }
      setInputValue('');
      onDismiss();
    },
    [inputValue, isButtonDisabled, onDismiss, options.input],
  );

  const buttons = useMemo(() => options.buttons ?? [{ text: 'OK' }], [options.buttons]);

  // Enter submits the primary (last) action.
  const handleSubmitEditing = useCallback(() => {
    handleClose(buttons[buttons.length - 1]);
  }, [handleClose, buttons]);

  return (
    <AppDialog visible onDismiss={onDismiss}>
      {options.title ? (
        <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
          {options.title}
        </AppText>
      ) : null}
      {options.message ? <AppText className="mb-2">{options.message}</AppText> : null}

      {options.input ? (
        <TextInput
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={handleSubmitEditing}
          placeholder={options.placeholder}
          autoFocus
          className="border px-2 py-2"
          style={[
            { borderColor: theme.colors.outline },
            options.error
              ? {
                  backgroundColor: theme.colors.errorContainer,
                  color: theme.colors.onErrorContainer,
                }
              : null,
          ]}
        />
      ) : null}

      {options.input && options.helperText ? (
        <AppText
          variant="plain"
          className="mt-1"
          style={{
            fontSize: 12,
            color: options.error ? theme.tokens.status.danger : theme.colors.onSurfaceVariant,
          }}
        >
          {options.helperText}
        </AppText>
      ) : null}

      <View style={dialogActionsStyle}>
        {buttons.map((btn) => (
          <DialogActionButton
            key={btn.text}
            button={btn}
            onSelect={handleClose}
            disabled={isButtonDisabled(btn)}
          />
        ))}
      </View>
    </AppDialog>
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
    <AppButton variant="ghost" onPress={handlePress} disabled={disabled}>
      {button.text}
    </AppButton>
  );
}

/**
 * Transient feedback message. Rendered as a plain overlay View — not a Modal —
 * so it announces via aria-live without trapping focus or being dismissable by
 * Escape (a toast is not a dialog).
 */
function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  const theme = useAppTheme();

  useEffect(() => {
    if (!message) return;
    // accessibilityLiveRegion is Android-only; VoiceOver needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <View
      className="absolute bottom-6 left-0 right-0 items-center"
      style={styles.toastContainer}
      pointerEvents="box-none"
    >
      <OverlaySurface
        className="px-4 py-2"
        style={[styles.toast, { backgroundColor: theme.colors.inverseSurface }]}
        tone="scrim"
      >
        <AppText
          variant="plain"
          accessibilityLiveRegion="polite"
          style={{ color: theme.colors.inverseOnSurface }}
        >
          {message}
        </AppText>
      </OverlaySurface>
    </View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    // zIndex 100 has no exact Tailwind step (scale tops out at 50).
    zIndex: 100,
  },
  toast: {
    maxWidth: '90%',
  },
});
