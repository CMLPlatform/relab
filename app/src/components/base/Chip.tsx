// NOTE: hand-rolled on purpose — Pressable two-segment pill with control radius and errorContainer state.
import type React from 'react';
import { useCallback } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
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
        { backgroundColor: error ? theme.colors.surfaceVariant : theme.colors.primaryContainer },
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
          style={[styles.label, { color: theme.colors.onPrimaryContainer }]}
        >
          {title}
        </AppText>
      ) : null}
      <AppText
        variant="label"
        className="rounded-md px-3 py-2 text-center font-medium"
        style={[
          styles.label,
          {
            backgroundColor: error ? theme.colors.errorContainer : theme.colors.primary,
            color: error ? theme.colors.onErrorContainer : theme.colors.onPrimary,
          },
        ]}
      >
        {children}
        {icon ? '   ' : null}
        {icon}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    borderRadius: radius.control,
  },
  label: {
    // fontSize 15 has no exact Tailwind step, so it stays inline.
    fontSize: 15,
  },
});
