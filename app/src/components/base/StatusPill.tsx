import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { radius } from '@/constants';
import { getStatusTone, useAppTheme } from '@/theme';
import type { AppTokens } from '@/theme/types';

export type StatusTone = keyof AppTokens['status'];

type StatusPillProps = {
  label: string;
  tone: StatusTone;
  /** 'solid' = filled emphatic badge (e.g. LIVE); 'soft' = tinted informational chip. */
  variant?: 'solid' | 'soft';
  testID?: string;
};

/**
 * Small status pill — the shared replacement for the near-identical LIVE badges
 * (solid) and the thermal-telemetry chip (soft). `tone` maps to a status token;
 * `variant` picks a solid fill or a tinted+bordered fill.
 */
export function StatusPill({ label, tone, variant = 'solid', testID }: StatusPillProps) {
  const theme = useAppTheme();
  const color = theme.tokens.status[tone];
  const solid = variant === 'solid';
  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        solid
          ? { backgroundColor: color }
          : { backgroundColor: getStatusTone(color), borderColor: color, borderWidth: 1 },
      ]}
    >
      <AppText
        style={[
          styles.label,
          { color: solid ? theme.colors.onError : color },
          solid && styles.bold,
        ]}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
    // Inline status chip — control radius, not a pill (DESIGN.md reserves the
    // `full` radius for avatars/true pills).
    borderRadius: radius.control,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
  },
  bold: {
    fontWeight: '700',
  },
});
