import type React from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { useAppTheme } from '@/theme';

export const Text: React.FC<TextProps> = ({ style, children, ...props }) => {
  const theme = useAppTheme();

  return (
    <NativeText style={[{ color: theme.colors.onSurface }, style]} {...props}>
      {children}
    </NativeText>
  );
};
