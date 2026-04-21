import { StyleSheet } from 'react-native';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import type { CameraConnectionStatus } from '@/services/api/rpiCamera';

export const STATUS_COLOR: Record<CameraConnectionStatus, string> = {
  online: '#2e7d32',
  offline: '#757575',
  unauthorized: '#f57c00',
  forbidden: '#f57c00',
  error: '#c62828',
};

export const STATUS_LABEL: Record<CameraConnectionStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  error: 'Error',
};

export type EffectiveConnection = {
  localConnection: CameraConnectionInfo;
  relayStatus: CameraConnectionStatus;
  isReachable: boolean;
};

export const cameraDetailStyles = StyleSheet.create({
  container: {
    padding: 12,
    paddingBottom: 48,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorMessage: {
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
  },
  card: {
    borderRadius: 12,
  },
  connectionContent: {
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineSpinner: {
    marginRight: 4,
  },
  inlineIcon: {
    marginRight: 4,
  },
  inlineDot: {
    marginRight: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    flex: 1,
  },
  statusTextMuted: {
    opacity: 0.6,
    flex: 1,
  },
  statusTextLocal: {
    color: '#2e7d32',
    flex: 1,
  },
  iconButton: {
    margin: 0,
  },
  connectionHint: {
    opacity: 0.55,
  },
  previewControlContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  previewCopy: {
    flex: 1,
  },
  detailsContent: {
    gap: 0,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  detailLabel: {
    opacity: 0.55,
    width: 100,
  },
  detailValue: {
    flex: 1,
  },
  monoDetail: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.45,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  stretchButton: {
    alignSelf: 'stretch',
  },
  actionButtonContent: {
    justifyContent: 'flex-start',
    paddingVertical: 6,
  },
  actionLabel: {
    fontWeight: '600',
  },
  actionSubtitle: {
    opacity: 0.6,
    marginTop: 1,
  },
  dialogContent: {
    gap: 12,
  },
  boldText: {
    fontWeight: 'bold',
  },
});
