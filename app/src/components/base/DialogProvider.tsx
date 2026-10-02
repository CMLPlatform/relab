import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useAppTheme } from '@/theme/appThemeContext';
import { useInverseSurface } from '@/theme/inverseSurface';
import { heading } from '@/utils/a11y';
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
  // Separate from `options` (kept on close) so AppDialog's `visible` transitions
  // true→false instead of unmounting; useReturnFocus only fires on that transition.
  const [visible, setVisible] = useState(false);
  // A fresh object per trigger: repeating the same message still produces a new
  // identity, so the Toast effect re-runs and the dismiss timer resets.
  const [toastState, setToastState] = useState<{
    message: string;
    action?: ToastAction;
  } | null>(null);
  const [dialogVersion, setDialogVersion] = useState(0);

  // One dialog at a time; one raised while another is open waits its turn, so
  // a burst of failure alerts (several queued saves failing on reconnect)
  // shows each in order instead of keeping only the last.
  const openRef = useRef(false);
  const pendingRef = useRef<DialogOptions[]>([]);

  const show = useCallback((opts: DialogOptions) => {
    openRef.current = true;
    setOptions(opts);
    setVisible(true);
    setDialogVersion((version) => version + 1);
  }, []);

  const open = useCallback(
    (opts: DialogOptions) => {
      if (openRef.current) pendingRef.current.push(opts);
      else show(opts);
    },
    [show],
  );

  const alert = useCallback<DialogContextType['alert']>(
    (opts: DialogOptions) => open({ ...opts, input: false }),
    [open],
  );

  const input = useCallback<DialogContextType['input']>(
    (opts: DialogOptions) => open({ ...opts, input: true }),
    [open],
  );

  const toast = useCallback<DialogContextType['toast']>((message: string, action?: ToastAction) => {
    setToastState({ message, action });
  }, []);

  const clear = useCallback(() => {
    const next = pendingRef.current.shift();
    if (next) {
      show(next);
      return;
    }
    openRef.current = false;
    setVisible(false);
  }, [show]);

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

  // Every action (on-screen press, keyboard return) routes through here, so the
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
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      triggerRef={options.triggerRef}
      // Title first; a titleless confirm still has to announce as something, and its
      // message is the only text it carries.
      accessibilityLabel={options.title ?? options.message ?? 'Dialog'}
    >
      {options.title ? (
        <AppText variant="title" {...heading(2)} style={dialogTitleStyle}>
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
          // The dialog asks the question; the field is the answer to it.
          accessibilityLabel={options.title ?? options.placeholder ?? 'Value'}
          autoFocus
          className="border px-2 py-2"
          // Danger border only; the helperText caption carries the message.
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

  // The keyboard default gets primary emphasis; other non-destructive actions stay ghost.
  const variant = button.style === 'destructive' ? 'destructive' : isSubmit ? 'primary' : 'ghost';

  return (
    <AppButton variant={variant} onPress={handlePress} disabled={disabled}>
      {button.text}
    </AppButton>
  );
}

/** Transient feedback. A plain overlay View, not a Modal: aria-live without a focus trap. */
function Toast({
  state,
  onDismiss,
}: {
  state: { message: string; action?: ToastAction } | null;
  onDismiss: () => void;
}) {
  const inverse = useInverseSurface();
  const theme = useAppTheme();
  const message = state?.message ?? null;
  const action = state?.action;
  // WCAG 2.2.1: a toast the reader is pointing at or tabbed into must not leave.
  // Tracks the pointer/focus, not a toast, so a replacement toast under a resting
  // pointer stays held too.
  const [inside, setInside] = useState(false);
  const held = state !== null && inside;
  const hold = useCallback(() => setInside(true), []);
  const release = useCallback(() => setInside(false), []);
  // The hold area unmounts with the toast without a hover-out or blur, so reset here
  // (a render-time adjustment, not an effect, so no stale render in between).
  if (state === null && inside) setInside(false);

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
    // accessibilityLiveRegion is Android-only; VoiceOver needs an explicit announcement.
    if (state && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(state.message);
  }, [state]);

  useEffect(() => {
    // NOTE: resuming restarts the full timer rather than counting down the remainder.
    if (!state || held) return;
    const timer = setTimeout(
      onDismiss,
      state.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [state, onDismiss, held]);

  // The status region stays mounted while there is no message: assistive tech
  // only announces changes to a region it has already seen.
  return (
    <View
      className="absolute bottom-6 left-0 right-0 items-center"
      style={styles.toastContainer}
      pointerEvents="box-none"
      // NOTE: exiting Animated.View must outlive this non-animated wrapper; without
      // collapsable={false} view flattening can drop the wrapper before the exit plays.
      collapsable={false}
    >
      <View testID="toast-live-region" role="status" accessibilityLiveRegion="polite">
        {message ? (
          <Animated.View
            entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          >
            <Pressable
              testID="toast-hold-area"
              accessible={false}
              // RN-Web ignores `accessible` and defaults Pressable to tabIndex 0.
              // Focus from the Undo button still bubbles here to hold the toast.
              tabIndex={-1}
              onHoverIn={hold}
              onHoverOut={release}
              onFocus={hold}
              onBlur={release}
            >
              <OverlaySurface
                className={cn('flex-row items-center gap-3 px-4', action ? 'py-1' : 'py-2')}
                style={[
                  styles.toast,
                  theme.tokens.elevation.overlay,
                  { backgroundColor: inverse.background },
                ]}
                tone="scrim"
              >
                <AppText
                  variant="body"
                  // Only shrink when sharing the row: alone, the toast hugs its message.
                  className={action ? 'flex-1' : undefined}
                  style={{ color: inverse.foreground }}
                >
                  {message}
                </AppText>
                {action ? (
                  // Ink from useInverseSurface (Inverse-Pair Rule), not the variant's own foreground.
                  <AppButton variant="ghost" className="-mr-2 px-2" onPress={handleAction}>
                    <AppText variant="label" style={{ color: inverse.foreground }}>
                      {action.label}
                    </AppText>
                  </AppButton>
                ) : null}
              </OverlaySurface>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
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
