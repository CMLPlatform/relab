import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
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
    borderRadius: 12,
  },
});
