import type React from 'react';
import { useCallback } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
} from 'react-native';
import { radius, spacing } from '@/constants';
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
        styles.container,
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
          variant="plain"
          style={[styles.titleText, { color: theme.colors.onPrimaryContainer }]}
        >
          {title}
        </AppText>
      ) : null}
      <AppText
        variant="plain"
        style={[
          styles.text,
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
  container: {
    borderRadius: radius.control,
    flexDirection: 'row',
  },
  text: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
  },
  titleText: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
  },
});
