import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { StatusPill, type StatusTone } from '@/components/base/StatusPill';
import type { CameraTelemetry, ThermalState } from '@/services/api/rpiCamera';

/** Thermal-state chip for a camera card (CPU temperature + state). Null without telemetry. */
export function TelemetryBadge({ telemetry }: { telemetry: CameraTelemetry | null | undefined }) {
  if (!telemetry) return null;

  const label =
    telemetry.cpu_temp_c != null
      ? `${telemetry.cpu_temp_c.toFixed(0)}°C · ${STATE_LABEL[telemetry.thermal_state]}`
      : STATE_LABEL[telemetry.thermal_state];

  return (
    <View className="flex-row items-center gap-1.5">
      <StatusPill label={label} tone={STATE_TONE[telemetry.thermal_state]} variant="soft" />
      {telemetry.preview_sessions > 0 && (
        <AppText variant="label" className="text-muted-foreground">
          {telemetry.preview_sessions} live
        </AppText>
      )}
    </View>
  );
}

const STATE_TONE: Record<ThermalState, StatusTone> = {
  normal: 'offline',
  warm: 'info',
  throttle: 'warning',
  critical: 'danger',
};

const STATE_LABEL: Record<ThermalState, string> = {
  normal: 'Normal',
  warm: 'Warm',
  throttle: 'Throttle',
  critical: 'Critical',
};
