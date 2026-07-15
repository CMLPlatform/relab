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

export const cameraDetailStyles = StyleSheet.create({
  container: {
    padding: 12,
    paddingBottom: 48,
    gap: 12,
  },
  card: {
    borderRadius: 12,
  },
  // Base Card has no built-in content padding (unlike Paper's Card.Content,
  // which defaults to padding: 16) — every former Card.Content wrapper needs
  // it added explicitly.
  cardContent: {
    padding: 16,
  },
  connectionContent: {
    padding: 16,
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
    flex: 1,
  },
  iconButton: {
    margin: 0,
  },
  connectionHint: {
    opacity: 0.55,
  },
  previewControlContent: {
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  previewCopy: {
    flex: 1,
  },
  detailsContent: {
    padding: 16,
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
