import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

const getStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    text: { color: theme.colors.onSurface },
  }),
);

export const Text = ({ style, children, ...props }: TextProps) => {
  const styles = getStyles(useAppTheme());

  return (
    <NativeText style={[styles.text, style]} {...props}>
      {children}
    </NativeText>
  );
};
