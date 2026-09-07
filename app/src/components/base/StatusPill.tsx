import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { getStatusTone, useAppTheme } from '@/theme';
import type { AppTokens } from '@/theme/types';

// onStatus is the fill's foreground text color, not a selectable tone.
export type StatusTone = Exclude<keyof AppTokens['status'], 'onStatus'>;

type StatusPillProps = {
  label: string;
  tone: StatusTone;
  /** 'solid' = filled emphatic badge (e.g. LIVE); 'soft' = tinted informational chip. */
  variant?: 'solid' | 'soft';
  testID?: string;
};

/** Small status pill. `tone` maps to a status token; `variant` is solid or tinted+bordered. */
export function StatusPill({ label, tone, variant = 'solid', testID }: StatusPillProps) {
  const theme = useAppTheme();
  const color = theme.tokens.status[tone];
  const solid = variant === 'solid';
  return (
    <View
      testID={testID}
      // Control radius, not `full` (True-Pill Rule). Height 24 has no Tailwind step.
      className="justify-center rounded-md px-2"
      style={[
        styles.pill,
        solid
          ? { backgroundColor: color }
          : { backgroundColor: getStatusTone(color), borderColor: color, borderWidth: 1 },
      ]}
    >
      <AppText
        variant="caption"
        className={solid ? 'font-bold' : undefined}
        style={{ color: solid ? theme.tokens.status.onStatus : color }}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    // minHeight, not height, so a scaled caption line is not clipped.
    minHeight: 24,
  },
});
