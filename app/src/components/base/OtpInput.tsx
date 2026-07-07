import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { type AppTheme, useAppTheme } from '@/theme';

type OtpInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** Fired once the field fills, so callers can submit without a button press. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
  accessibilityLabel?: string;
};

/**
 * Classic segmented one-time-code field: `length` visible cells backed by a
 * single transparent TextInput. One input keeps OS autofill, paste, and the
 * numeric keyboard working everywhere — no per-cell focus juggling.
 */
export function OtpInput({
  value,
  onChangeText,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
  hasError = false,
  accessibilityLabel = 'One-time code',
}: OtpInputProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cells = useMemo(() => Array.from({ length }, (_, index) => index), [length]);
  const inputRef = useRef<TextInput>(null);

  // autoFocus alone is unreliable inside a Portal/Dialog and on web, so focus
  // via the ref once mounted (a tick after the dialog's open animation).
  useEffect(() => {
    if (!autoFocus || disabled) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [autoFocus, disabled]);

  const handleChange = useCallback(
    (raw: string) => {
      const next = raw.replace(/\D/g, '').slice(0, length);
      onChangeText(next);
      if (next.length === length) onComplete?.(next);
    },
    [length, onChangeText, onComplete],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {cells.map((index) => {
          const filled = index < value.length;
          const focused = index === value.length && !disabled;
          return (
            <View
              key={index}
              style={[
                styles.cell,
                filled && styles.cellFilled,
                focused && styles.cellFocused,
                hasError && styles.cellError,
              ]}
            >
              <Text style={styles.digit}>{value[index] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChange}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      position: 'relative',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 320,
    },
    row: {
      flexDirection: 'row',
      gap: 8,
    },
    cell: {
      flex: 1,
      height: 56,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.tokens.border.subtle,
      backgroundColor: theme.tokens.surface.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellFilled: {
      borderColor: theme.tokens.border.strong,
    },
    cellFocused: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.tokens.surface.accent,
    },
    cellError: {
      borderColor: theme.tokens.status.danger,
    },
    digit: {
      fontSize: 24,
      fontWeight: '600',
    },
    hiddenInput: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0,
      color: 'transparent',
    },
  });
}
