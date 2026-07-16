import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';

type OverlaySurfaceProps = {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  /**
   * 'surface' is an opaque panel — what a dialog or modal needs, since content
   * sits on it and has to be readable. The rest are translucent films meant to
   * be drawn *over* content ('scrim' also being the colour of the backdrop
   * behind a modal), so a panel painted with one shows the page through itself.
   */
  tone?: 'surface' | 'scrim' | 'media' | 'glass';
};

export function OverlaySurface({ children, style, tone = 'scrim' }: OverlaySurfaceProps) {
  const theme = useAppTheme();
  const backgroundColor = tone === 'surface' ? theme.colors.surface : theme.tokens.overlay[tone];
  return <View style={[styles.base, { backgroundColor }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    // Floating chrome (tooltips, toasts, dialog surfaces) — overlay radius.
    borderRadius: radius.overlay,
  },
});
