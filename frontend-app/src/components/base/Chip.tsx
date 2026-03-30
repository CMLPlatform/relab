import React from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { spacing, radius } from '@/constants/layout';

import { Text } from '@/components/base/Text';

interface Props extends PressableProps {
  children?: string;
  title?: string;
  icon?: React.ReactNode;
  error?: boolean;
}

export const Chip: React.FC<Props> = ({ style, children, title, icon, error, ...props }) => {
  const { colors } = useAppTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: error ? colors.surfaceVariant : colors.primaryContainer },
        pressed && { opacity: 0.5 },
      ]}
      {...props}
    >
      {title && <Text style={[styles.titleText, { color: colors.onPrimaryContainer }]}>{title}</Text>}
      <Text
        style={[
          styles.text,
          {
            backgroundColor: error ? colors.errorContainer : colors.primary,
            color: error ? colors.onErrorContainer : colors.onPrimary,
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
