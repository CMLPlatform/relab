import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';

type OverlaySurfaceProps = {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  tone?: 'scrim' | 'media' | 'glass';
};

export function OverlaySurface({ children, style, tone = 'scrim' }: OverlaySurfaceProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.base, { backgroundColor: theme.tokens.overlay[tone] }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    // Floating chrome (tooltips, toasts, dialog surfaces) — overlay radius.
    borderRadius: radius.overlay,
  },
});
