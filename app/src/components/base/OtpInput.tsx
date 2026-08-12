import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';
import { AppText } from './AppText';

type OtpInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** Fired once the field fills, so callers can submit without a button press. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
  /** Visible field label, rendered above the cells inside the same width cap. */
  label?: string;
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
  label,
  // Keep the accessible name equal to the visible label (WCAG 2.5.3).
  accessibilityLabel = label ?? 'One-time code',
}: OtpInputProps) {
  const styles = createStyles(useAppTheme());
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
    <View className="relative w-full max-w-xs self-center gap-1">
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View className="flex-row gap-2">
        {Array.from({ length }, (_, index) => index).map((index) => {
          const filled = index < value.length;
          const focused = index === value.length && !disabled;
          return (
            <View
              key={index}
              className="flex-1 items-center justify-center rounded-md"
              style={[
                styles.cell,
                filled && styles.cellFilled,
                focused && styles.cellFocused,
                hasError && styles.cellError,
              ]}
            >
              <AppText variant="data" className="font-semibold" style={{ fontSize: 24 }}>
                {value[index] ?? ''}
              </AppText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        className="absolute inset-0 opacity-0"
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

const createStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    cell: {
      height: 56,
      // 1.5 has no exact Tailwind border-width step, and the border/fill
      // colors are JS-only tokens — the whole cell border+fill stays inline.
      borderWidth: 1.5,
      borderColor: theme.tokens.border.subtle,
      backgroundColor: theme.tokens.surface.sunken,
    },
    cellFilled: {
      borderColor: theme.tokens.border.strong,
    },
    cellFocused: {
      // theme.colors.primary as a border color has no table entry (only
      // bg-primary/text-primary are mapped), so this stays JS-side too.
      borderColor: theme.colors.primary,
      backgroundColor: theme.tokens.surface.accent,
    },
    cellError: {
      borderColor: theme.tokens.status.danger,
    },
    hiddenInput: {
      // color: 'transparent' isn't a table-mapped class; kept alongside the
      // position/inset it used to share so one declaration covers it.
      color: 'transparent',
    },
  }),
);
