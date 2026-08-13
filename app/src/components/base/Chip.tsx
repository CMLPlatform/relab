// NOTE: hand-rolled on purpose — Pressable two-segment pill with control radius and danger-tint state.
import type React from 'react';
import { useCallback } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
  View,
} from 'react-native';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { getStatusTone, useAppTheme } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props extends PressableProps {
  children?: string;
  title?: string;
  icon?: React.ReactNode;
  error?: boolean;
}

export const Chip = ({
  style,
  children,
  title,
  icon,
  error,
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  ...props
}: Props) => {
  const theme = useAppTheme();
  const danger = theme.tokens.status.danger;

  const resolveStyle = useCallback(
    (state: PressableStateCallbackType) => {
      const resolvedStyle = typeof style === 'function' ? style(state) : style;
      return [
        // No className on this Pressable: it would drop this function (see IconButton.tsx).
        styles.base,
        { backgroundColor: theme.tokens.surface.accent },
        state.pressed && { opacity: 0.5 },
        resolvedStyle,
      ];
    },
    [style, theme],
  );

  // Composed so a screen reader gets one coherent name ("Brand: Unknown,
  // required") instead of reading the title and value segments separately;
  // an explicit accessibilityLabel from the caller always wins.
  const composedLabel =
    accessibilityLabel ??
    (title ? `${title}: ${children ?? ''}${error ? ', required' : ''}` : undefined);

  return (
    <Pressable
      style={resolveStyle}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={composedLabel}
      accessibilityState={accessibilityState ?? (disabled ? { disabled } : undefined)}
      {...props}
    >
      {title ? (
        <AppText
          variant="label"
          className="px-3 py-2 text-center font-medium"
          style={{ color: theme.colors.primary }}
        >
          {title}
        </AppText>
      ) : null}
      <View
        className="flex-row items-center gap-1.5 rounded-md px-3 py-2"
        style={{
          backgroundColor: error ? getStatusTone(danger) : theme.colors.primary,
          borderColor: error ? danger : undefined,
          borderWidth: error ? 1 : 0,
        }}
      >
        {/* Error state must not be color-only (WCAG 1.4.1): a compact alert icon
            carries the signal alongside the danger tint/border/text. */}
        {error ? <Icon name="circle-alert" size={14} color={danger} /> : null}
        <AppText
          variant="label"
          className="text-center font-medium"
          style={{ color: error ? danger : theme.colors.onPrimary }}
        >
          {children}
        </AppText>
        {icon}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    borderRadius: radius.control,
    minHeight: MIN_TAP_TARGET,
  },
});
