import { Text as NativeText, type TextProps } from 'react-native';
import { useAppTheme } from '@/theme';

export const Text = ({ style, children, ...props }: TextProps) => {
  const theme = useAppTheme();

  return (
    <NativeText style={[{ color: theme.colors.onSurface }, style]} {...props}>
      {children}
    </NativeText>
  );
};
