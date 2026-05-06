import type React from 'react';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { useAppTheme } from '@/theme';

export const Text: React.FC<TextProps> = ({ style, children, ...props }) => {
  const theme = useAppTheme();

  return (
    <NativeText style={[styles.base, { color: theme.colors.onSurface }, style]} {...props}>
      {children}
    </NativeText>
  );
};

const styles = StyleSheet.create({
  base: {
    fontFamily: 'IBMPlexSans-Regular',
  },
});
