import type { RefObject } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { IconButton } from '@/components/base/IconButton';
import { LivePreview } from '@/components/cameras/LivePreview';
import type { CameraConnectionInfo } from '@/features/cameras/local-connection/useLocalConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { getStatusColor, useAppTheme } from '@/theme';
import { type EffectiveConnection, STATUS_LABEL, cameraDetailStyles as styles } from './styles';

type CameraConnectionCardProps = {
  camera: CameraReadWithStatus;
  effectiveConnection: EffectiveConnection;
  isFetching: boolean;
  onRefresh: () => void;
  onOpenManualSetup: () => void;
  onDisconnectLocal: () => void;
  manualSetupTriggerRef?: RefObject<View | null>;
};

export function CameraConnectionCard({
  camera,
  effectiveConnection,
  isFetching,
  onRefresh,
  onOpenManualSetup,
  onDisconnectLocal,
  manualSetupTriggerRef,
}: CameraConnectionCardProps) {
  const theme = useAppTheme();
  const { localConnection, relayStatus } = effectiveConnection;
  const isOnline = relayStatus === 'online';
  const statusColor = getStatusColor(theme, camera.status?.connection ?? 'offline');
  const statusLabel = camera.status ? STATUS_LABEL[camera.status.connection] : STATUS_LABEL.offline;

  return (
    <Card>
      <View className="gap-1.5 p-4">
        <View className="flex-row items-center gap-2">
          {localConnection.mode === 'probing' ? (
            <>
              <ActivityIndicator size={14} className="mr-1" />
              <AppText variant="title" className="flex-1 opacity-60">
                {isOnline ? 'Searching for direct connection…' : 'Checking connection…'}
              </AppText>
            </>
          ) : localConnection.mode === 'local' ? (
            <>
              <View className="mr-1">
                <Icon name="ethernet" size={18} color={theme.tokens.status.success} />
              </View>
              <AppText
                variant="title"
                className="flex-1"
                style={{ color: theme.tokens.status.success }}
              >
                Connected - Direct · &lt;1 s
              </AppText>
            </>
          ) : isOnline ? (
            <>
              <View
                className="mr-1 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              <AppText variant="title" className="flex-1" style={{ color: statusColor }}>
                Connected - Remote · ~2 s
              </AppText>
            </>
          ) : (
            <>
              <View
                className="mr-1 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              <AppText variant="title" className="flex-1" style={{ color: statusColor }}>
                {statusLabel}
              </AppText>
            </>
          )}

          <IconButton
            icon="refresh"
            size={18}
            loading={isFetching}
            onPress={onRefresh}
            accessibilityLabel="Refresh status"
            style={styles.iconButton}
          />

          {localConnection.mode === 'local' ? (
            <AppButton variant="ghost" onPress={onDisconnectLocal}>
              Disconnect
            </AppButton>
          ) : null}

          {localConnection.mode === 'relay' ? (
            <View ref={manualSetupTriggerRef} collapsable={false}>
              <AppButton variant="ghost" onPress={onOpenManualSetup}>
                Manual setup…
              </AppButton>
            </View>
          ) : null}
        </View>

        <AppText variant="body" className="opacity-55">
          {localConnection.mode === 'local'
            ? `Via Ethernet · ${localConnection.localBaseUrl ?? ''}`
            : localConnection.mode === 'probing' && isOnline
              ? 'Camera online — checking local network for a faster direct connection'
              : isOnline
                ? 'Via WebSocket relay — connect Ethernet for ~0.4 s latency instead of ~2 s'
                : camera.status?.connection === 'offline'
                  ? 'Waiting for camera to connect via WebSocket relay'
                  : statusLabel}
        </AppText>
      </View>
    </Card>
  );
}

type CameraPreviewSectionProps = {
  camera: CameraReadWithStatus;
  canPreview: boolean;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  connectionInfo: CameraConnectionInfo;
};

export function CameraPreviewSection({
  camera,
  canPreview,
  previewEnabled,
  onTogglePreview,
  connectionInfo,
}: CameraPreviewSectionProps) {
  if (!canPreview) return null;

  return (
    <>
      <Card>
        <View className="flex-row items-center gap-3 p-4">
          <View className="flex-1">
            <AppText variant="title">Camera preview</AppText>
            <AppText variant="body" className="opacity-55">
              {previewEnabled
                ? 'Preview is running. Stop it when you no longer need the live feed.'
                : 'Load the live feed when you want to check framing or focus.'}
            </AppText>
          </View>
          <AppButton variant={previewEnabled ? 'outline' : 'primary'} onPress={onTogglePreview}>
            {previewEnabled ? 'Stop preview' : 'Load preview'}
          </AppButton>
        </View>
      </Card>
      {previewEnabled ? <LivePreview camera={camera} connectionInfo={connectionInfo} /> : null}
    </>
  );
}
