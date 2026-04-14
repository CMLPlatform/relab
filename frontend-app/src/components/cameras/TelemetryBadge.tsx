import { StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import type { CameraTelemetry, ThermalState } from '@/services/api/rpiCamera';

/**
 * Compact thermal-state chip for a camera card.
 *
 * Renders a coloured chip showing the CPU temperature + thermal state so the
 * user can spot a hot Pi at a glance. Returns null when we have no telemetry
 * yet — absence of data is not itself a warning.
 */
export function TelemetryBadge({ telemetry }: { telemetry: CameraTelemetry | null | undefined }) {
  if (!telemetry) return null;

  const color = STATE_COLOR[telemetry.thermal_state];
  const label =
    telemetry.cpu_temp_c != null
      ? `${telemetry.cpu_temp_c.toFixed(0)}°C · ${STATE_LABEL[telemetry.thermal_state]}`
      : STATE_LABEL[telemetry.thermal_state];

  return (
    <View style={styles.row}>
      <Chip
        mode="flat"
        compact
        style={[styles.chip, { backgroundColor: `${color}22`, borderColor: color }]}
        textStyle={{ color, fontSize: 11 }}
      >
        {label}
      </Chip>
      {telemetry.preview_sessions > 0 && (
        <Text variant="labelSmall" style={styles.subtext}>
          {telemetry.preview_sessions} live
        </Text>
      )}
    </View>
  );
}

const STATE_COLOR: Record<ThermalState, string> = {
  normal: '#757575',
  warm: '#1976d2',
  throttle: '#f57c00',
  critical: '#c62828',
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
  },
  subtext: {
    opacity: 0.6,
  },
});
