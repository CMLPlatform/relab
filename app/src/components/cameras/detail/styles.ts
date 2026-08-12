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
  // fontSize 12 travels with it rather than splitting one property out.
  monoDetail: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  // fontSize 11 has no matching text-* step, and the named t-shirt classes
  // (text-xs, etc.) carry a lineHeight this style never set — kept inline
  // rather than force a class that would change line height.
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
