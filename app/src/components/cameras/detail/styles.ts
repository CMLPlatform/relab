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

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius, var-backed color) moved to className at the call
// site. What's left needs JS because it's either clobbered by its host
// component's own className handling, or would force a class that doesn't
// exist at this exact value.
export const cameraDetailStyles = StyleSheet.create({
  // IconButton ignores/overwrites a caller className (see IconButton.tsx),
  // so this stays a style prop.
  iconButton: {
    margin: 0,
  },
  // fontFamily: 'monospace' has no NativeWind equivalent that preserves RN's
  // platform-resolved monospace font (font-mono pulls a web font stack);
  // fontSize/lineHeight travel with it rather than splitting one property
  // out. Stepped to the caption size (13/18) instead of the stray 12/unset.
  monoDetail: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  // Sits on an AppText variant="label" (13/18) — dropping the stray 11px
  // override lets it inherit the label step's size/lineHeight; only the
  // weight bump is still needed here.
  sectionLabel: {
    fontWeight: '600',
  },
});
