import { StyleSheet } from 'react-native';
import type { EffectiveCameraConnection } from '@/features/cameras/useEffectiveCameraConnection';
import type { CameraConnectionStatus } from '@/services/api/rpiCamera';

export const STATUS_LABEL: Record<CameraConnectionStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  error: 'Error',
};

export type EffectiveConnection = Pick<
  EffectiveCameraConnection,
  'localConnection' | 'relayStatus' | 'isReachable'
>;

// Only what has no className equivalent stays here.
export const cameraDetailStyles = StyleSheet.create({
  // IconButton ignores/overwrites a caller className (see IconButton.tsx),
  // so this stays a style prop.
  iconButton: {
    margin: 0,
  },
  // font-mono pulls a web font stack; 'monospace' keeps RN's platform font.
  monoDetail: {
    fontFamily: 'monospace',
    // NOTE: caption size (13/18) on a mono face; no mono-13 step exists.
    fontSize: 13,
    lineHeight: 18,
  },
  // Size/lineHeight come from AppText variant="label".
  sectionLabel: {
    fontWeight: '600',
  },
});
