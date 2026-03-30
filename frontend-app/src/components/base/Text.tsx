import React from 'react';
import { Text as NativeText, TextProps, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

export const Text: React.FC<TextProps> = ({ style, children, ...props }) => {
  const { colors } = useAppTheme();

  return (
    <NativeText style={[styles.base, { color: colors.onSurface }, style]} {...props}>
      {children}
    </NativeText>
  );
};

const styles = StyleSheet.create({
  base: {
    fontFamily: 'System',
  },
});
