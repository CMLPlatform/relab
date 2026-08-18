import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useAppTheme, useInverseSurface } from '@/theme';
import { cn } from '@/utils/cn';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';
import { AppText } from './AppText';
import {
  type DialogButton,
  DialogContext,
  type DialogContextType,
  type DialogOptions,
  pickSubmitButton,
  type ToastAction,
} from './dialogContext';
import { dialogActionsStyle, dialogTitleStyle } from './dialogStyles';
import { OverlaySurface } from './OverlaySurface';
import { TextInput } from './TextInput';

// Within WCAG's 3-5s auto-dismiss guidance for transient toasts.
const TOAST_DURATION_MS = 4000;
// A toast carrying an action needs long enough to be noticed, read and reached;
// WCAG 2.2.1 allows the longer dismiss precisely because there is a control.
const ACTION_TOAST_DURATION_MS = 8000;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  // Separate from `options` (which is kept around, not nulled, on close) so AppDialog's
  // `visible` prop actually transitions true→false instead of the whole tree unmounting —
  // useReturnFocus's return-focus-on-close logic (web and native, incl. triggerRef) only
  // fires on that transition, never on unmount.
  const [visible, setVisible] = useState(false);
  // A fresh object per trigger: repeating the same message still produces a new
  // identity, so the Toast effect re-runs and the dismiss timer resets.
  const [toastState, setToastState] = useState<{
    message: string;
    action?: ToastAction;
  } | null>(null);
  const [dialogVersion, setDialogVersion] = useState(0);

  const alert = useCallback<DialogContextType['alert']>((opts: DialogOptions) => {
    setOptions({ ...opts, input: false });
    setVisible(true);
    setDialogVersion((version) => version + 1);
  }, []);

  const input = useCallback<DialogContextType['input']>((opts: DialogOptions) => {
    setOptions({ ...opts, input: true });
    setVisible(true);
    setDialogVersion((version) => version + 1);
  }, []);

  const toast = useCallback<DialogContextType['toast']>((message: string, action?: ToastAction) => {
    setToastState({ message, action });
  }, []);

  const clear = useCallback(() => {
    setVisible(false);
  }, []);

  const dismissToast = useCallback(() => {
    setToastState(null);
  }, []);

  const contextValue = useMemo(() => ({ alert, input, toast }), [alert, input, toast]);

  return (
    <DialogContext.Provider value={contextValue}>
      {children}

      {/* key remounts the body per dialog so the input resets to its defaultValue. */}
      {options ? (
        <DialogBody key={dialogVersion} options={options} visible={visible} onDismiss={clear} />
      ) : null}
      <Toast state={toastState} onDismiss={dismissToast} />
    </DialogContext.Provider>
  );
}

function DialogBody({
  options,
  visible,
  onDismiss,
}: {
  options: DialogOptions;
  visible: boolean;
  onDismiss: () => void;
}) {
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

  // Enter submits the last non-destructive, non-cancel action; a dialog whose only
  // action is destructive gets no keyboard default at all.
  const submitButton = useMemo(() => pickSubmitButton(buttons), [buttons]);
  const handleSubmitEditing = useCallback(() => {
    if (submitButton) handleClose(submitButton);
  }, [handleClose, submitButton]);

  return (
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={options.triggerRef}>
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
          // Danger border, not a full errorContainer recolor (MD3 *Container
          // roles are retired) — the helperText caption below carries the message.
          style={{
            borderColor: options.error ? theme.tokens.status.danger : theme.colors.outline,
          }}
        />
      ) : null}

      {options.input && options.helperText ? (
        <AppText
          variant="caption"
          className="mt-1"
          style={{
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
            isSubmit={btn === submitButton}
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
  isSubmit,
  onSelect,
  disabled,
}: {
  button: DialogButton;
  isSubmit: boolean;
  onSelect: (btn: DialogButton) => void;
  disabled: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelect(button);
  }, [onSelect, button]);

  // Destructive keeps its filled destructive variant; the button Enter would
  // submit gets the same emphasis (AppButton's primary) so its visual weight
  // matches the keyboard default. Every other action stays ghost.
  const variant = button.style === 'destructive' ? 'destructive' : isSubmit ? 'primary' : 'ghost';

  return (
    <AppButton variant={variant} onPress={handlePress} disabled={disabled}>
      {button.text}
    </AppButton>
  );
}

/**
 * Transient feedback message. Rendered as a plain overlay View — not a Modal —
 * so it announces via aria-live without trapping focus or being dismissable by
 * Escape (a toast is not a dialog).
 */
function Toast({
  state,
  onDismiss,
}: {
  state: { message: string; action?: ToastAction } | null;
  onDismiss: () => void;
}) {
  const inverse = useInverseSurface();
  const message = state?.message ?? null;
  const action = state?.action;

  // Dismiss first: the action may raise a toast of its own, and these two state
  // updates batch in call order, so dismissing afterwards would swallow it.
  const handleAction = useCallback(() => {
    onDismiss();
    action?.onPress();
  }, [action, onDismiss]);

  // Depends on the state OBJECT, not the message string: each toast() call
  // mints a new object, so a repeated identical message still restarts the
  // timer (and re-announces on iOS; Android's live region ignores equal text).
  useEffect(() => {
    if (!state) return;
    // accessibilityLiveRegion is Android-only; VoiceOver needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(state.message);
    const timer = setTimeout(
      onDismiss,
      state.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [state, onDismiss]);

  if (!message) return null;

  return (
    <View
      className="absolute bottom-6 left-0 right-0 items-center"
      style={styles.toastContainer}
      pointerEvents="box-none"
      // NOTE: exiting Animated.View must outlive this non-animated wrapper — without
      // collapsable={false} view flattening can drop the wrapper before the exit plays.
      collapsable={false}
    >
      <Animated.View
        entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
      >
        <OverlaySurface
          className={cn('flex-row items-center gap-3 px-4', action ? 'py-1' : 'py-2')}
          style={[styles.toast, { backgroundColor: inverse.background }]}
          tone="scrim"
        >
          <AppText
            variant="body"
            accessibilityLiveRegion="polite"
            // Only shrink when sharing the row: alone, the toast hugs its message.
            className={action ? 'flex-1' : undefined}
            style={{ color: inverse.foreground }}
          >
            {message}
          </AppText>
          {action ? (
            // Ghost keeps the inverse ground showing through; the label takes its
            // ink from useInverseSurface (the Inverse-Pair Rule) rather than the
            // button variant's own foreground, which assumes a same-polarity surface.
            <AppButton variant="ghost" className="-mr-2 px-2" onPress={handleAction}>
              <AppText variant="label" style={{ color: inverse.foreground }}>
                {action.label}
              </AppText>
            </AppButton>
          ) : null}
        </OverlaySurface>
      </Animated.View>
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
