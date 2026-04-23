import type React from 'react';
import { Pressable, type PressableProps, StyleSheet } from 'react-native';
import { Text } from '@/components/base/Text';
import { radius, spacing } from '@/constants/layout';
import { useAppTheme } from '@/theme';

interface Props extends PressableProps {
  children?: string;
  title?: string;
  icon?: React.ReactNode;
  error?: boolean;
}

export const Chip: React.FC<Props> = ({ style, children, title, icon, error, ...props }) => {
  const theme = useAppTheme();

  return (
    <Pressable
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return [
          styles.container,
          { backgroundColor: error ? theme.colors.surfaceVariant : theme.colors.primaryContainer },
          state.pressed && { opacity: 0.5 },
          resolvedStyle,
        ];
      }}
      {...props}
    >
      {title && (
        <Text style={[styles.titleText, { color: theme.colors.onPrimaryContainer }]}>{title}</Text>
      )}
      <Text
        style={[
          styles.text,
          {
            backgroundColor: error ? theme.colors.errorContainer : theme.colors.primary,
            color: error ? theme.colors.onErrorContainer : theme.colors.onPrimary,
          },
        ]}
      >
        {children}
        {icon && '   '}
        {icon}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.sm + 1,
    flexDirection: 'row',
  },
  text: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 12,
    borderRadius: radius.sm + 1,
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
