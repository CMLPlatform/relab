import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { TelemetryBadge } from '@/components/cameras/TelemetryBadge';
import type { EffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import type { CameraConnectionStatus, CameraReadWithStatus } from '@/services/api/rpiCamera';

const STATUS_COLOR: Record<CameraConnectionStatus, string> = {
  online: '#2e7d32',
  offline: '#757575',
  unauthorized: '#f57c00',
  forbidden: '#f57c00',
  error: '#c62828',
};

const STATUS_LABEL: Record<CameraConnectionStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  error: 'Error',
};

function StatusBadge({ status }: { status: CameraConnectionStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <View
      style={{
        backgroundColor: `${color}22`,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/**
 * Format an ISO-8601 timestamp as a compact relative string for the offline
 * overlay, e.g. ``42s ago``, ``3m ago``, ``5h ago``, ``2d ago``.
 */
function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return 'never seen';
  const lastSeen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeen)) return 'never seen';
  const diffSeconds = Math.max(0, Math.round((Date.now() - lastSeen) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Camera card used by the mosaic dashboard.
 *
 * Three visual states, deliberately distinct so a user can tell "offline" from
 * "online but no captures yet" at a glance:
 *
 *   - **Online + has captures:** thumbnail on top, status + telemetry chips
 *     below. Full opacity.
 *   - **Online + no captures yet:** icon placeholder with "No captures yet"
 *     caption, telemetry chip. Full opacity.
 *   - **Offline:** whole card dimmed to 60% opacity, status chip in the
 *     offline colour, "Last seen X ago" caption replaces telemetry. No
 *     thumbnail. Online cards use the latest stored capture thumbnail instead
 *     of issuing live snapshot requests from the mosaic.
 *
 * Tapping the card navigates to the camera detail screen regardless of
 * state so users can still see history / dialog / settings when offline.
 */
export function CameraCard({
  camera,
  effectiveConnection,
}: {
  camera: CameraReadWithStatus;
  effectiveConnection?: EffectiveCameraConnection;
}) {
  const theme = useTheme();
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const connection = effectiveConnection?.status ?? camera.status?.connection ?? 'offline';
  const isOnline = connection === 'online';
  const resolvedThumbnailUrl = camera.last_image_thumbnail_url ?? camera.last_image_url ?? null;
  const hasThumbnail =
    isOnline && !!resolvedThumbnailUrl && failedThumbnailUrl !== resolvedThumbnailUrl;

  return (
    <Card
      style={[
        styles.card,
        { backgroundColor: theme.colors.elevation.level1 },
        !isOnline && styles.cardOffline,
      ]}
      accessibilityLabel={`Camera: ${camera.name}`}
    >
      {/* Thumbnail (online only) or placeholder */}
      <View style={styles.thumbnailFrame}>
        {hasThumbnail ? (
          <Image
            source={{ uri: resolvedThumbnailUrl }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={150}
            onError={() => setFailedThumbnailUrl(resolvedThumbnailUrl)}
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            {isOnline ? (
              <>
                <MaterialCommunityIcons
                  name="image-outline"
                  size={40}
                  color={theme.colors.onSurfaceVariant}
                  style={{ opacity: 0.4 }}
                />
                <Text variant="bodySmall" style={styles.thumbnailCaption}>
                  No preview available
                </Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons
                  name="camera-off"
                  size={40}
                  color={theme.colors.onSurfaceVariant}
                  style={{ opacity: 0.4 }}
                />
                <Text variant="bodySmall" style={styles.thumbnailCaption}>
                  Offline
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      <Card.Content style={styles.cardContent}>
        <View style={styles.cardBody}>
          <Text variant="titleMedium" numberOfLines={1}>
            {camera.name}
          </Text>
          {camera.description ? (
            <Text variant="bodySmall" numberOfLines={1} style={{ opacity: 0.65, marginTop: 2 }}>
              {camera.description}
            </Text>
          ) : null}
          <View style={styles.cardChips}>
            <StatusBadge status={connection} />
            {isOnline ? (
              effectiveConnection?.detailLabel ? (
                <Text variant="labelSmall" style={styles.lastSeenText}>
                  {effectiveConnection.detailLabel}
                </Text>
              ) : (
                <TelemetryBadge telemetry={camera.telemetry} />
              )
            ) : (
              <Text variant="labelSmall" style={styles.lastSeenText}>
                Last seen {formatLastSeen(camera.status?.last_seen_at)}
              </Text>
            )}
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
  },
  cardOffline: {
    opacity: 0.6,
  },
  thumbnailFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#000',
    overflow: 'hidden',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thumbnailCaption: {
    color: '#999',
  },
  cardContent: {
    paddingVertical: 12,
  },
  cardBody: {
    gap: 4,
  },
  cardChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  lastSeenText: {
    opacity: 0.65,
  },
});
