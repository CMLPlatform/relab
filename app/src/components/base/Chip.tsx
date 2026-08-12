// NOTE: hand-rolled on purpose — Pressable two-segment pill with control radius and errorContainer state.
import type React from 'react';
import { useCallback } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
  View,
} from 'react-native';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';
import { AppText } from './AppText';

interface Props extends PressableProps {
  children?: string;
  title?: string;
  icon?: React.ReactNode;
  error?: boolean;
}

export const Chip = ({ style, children, title, icon, error, ...props }: Props) => {
  const theme = useAppTheme();

  const resolveStyle = useCallback(
    (state: PressableStateCallbackType) => {
      const resolvedStyle = typeof style === 'function' ? style(state) : style;
      return [
        // No className on this Pressable: it would drop this function (see IconButton.tsx).
        styles.base,
        { backgroundColor: error ? theme.colors.surfaceVariant : theme.tokens.surface.accent },
        state.pressed && { opacity: 0.5 },
        resolvedStyle,
      ];
    },
    [style, error, theme],
  );

  return (
    <Pressable style={resolveStyle} {...props}>
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
          backgroundColor: error ? theme.colors.errorContainer : theme.colors.primary,
        }}
      >
        <AppText
          variant="label"
          className="text-center font-medium"
          style={{ color: error ? theme.colors.onErrorContainer : theme.colors.onPrimary }}
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
  },
});
