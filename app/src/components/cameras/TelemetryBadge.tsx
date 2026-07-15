import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import type { CameraTelemetry, ThermalState } from '@/services/api/rpiCamera';
import { getStatusTone, useAppTheme } from '@/theme';

/**
 * Compact thermal-state chip for a camera card.
 *
 * Renders a coloured chip showing the CPU temperature + thermal state so the
 * user can spot a hot Pi at a glance. Returns null when we have no telemetry
 * yet — absence of data is not itself a warning.
 */
export function TelemetryBadge({ telemetry }: { telemetry: CameraTelemetry | null | undefined }) {
  const theme = useAppTheme();
  if (!telemetry) return null;

  const color = STATE_COLOR[telemetry.thermal_state](theme);
  const label =
    telemetry.cpu_temp_c != null
      ? `${telemetry.cpu_temp_c.toFixed(0)}°C · ${STATE_LABEL[telemetry.thermal_state]}`
      : STATE_LABEL[telemetry.thermal_state];

  return (
    <View style={styles.row}>
      <View style={[styles.chip, { backgroundColor: getStatusTone(color), borderColor: color }]}>
        <AppText style={{ color, fontSize: 11 }}>{label}</AppText>
      </View>
      {telemetry.preview_sessions > 0 && (
        <AppText variant="label" style={styles.subtext}>
          {telemetry.preview_sessions} live
        </AppText>
      )}
    </View>
  );
}

const STATE_COLOR: Record<ThermalState, (theme: ReturnType<typeof useAppTheme>) => string> = {
  normal: (theme) => theme.tokens.status.offline,
  warm: (theme) => theme.tokens.status.info,
  throttle: (theme) => theme.tokens.status.warning,
  critical: (theme) => theme.tokens.status.danger,
};

const STATE_LABEL: Record<ThermalState, string> = {
  normal: 'Normal',
  warm: 'Warm',
  throttle: 'Throttle',
  critical: 'Critical',
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  subtext: {
    opacity: 0.6,
  },
});
