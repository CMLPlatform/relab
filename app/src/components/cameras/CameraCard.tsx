import { Image } from 'expo-image';
import { memo, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { StatusPill, type StatusTone } from '@/components/base/StatusPill';
import { STATUS_LABEL } from '@/components/cameras/detail/styles';
import { radius } from '@/constants';
import type { EffectiveCameraConnection } from '@/features/cameras/useEffectiveCameraConnection';
import { useAuthedMediaSource } from '@/services/api/authedMedia';
import type { CameraConnectionStatus, CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';
import { TelemetryBadge } from './TelemetryBadge';

// Mirrors theme/color.ts's getStatusColor mapping, but as StatusPill tone
// keys rather than resolved colors — StatusPill resolves the color itself.
const CONNECTION_TONE: Record<CameraConnectionStatus, StatusTone> = {
  online: 'success',
  offline: 'offline',
  unauthorized: 'warning',
  forbidden: 'warning',
  error: 'danger',
};

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

function CameraCardComponent({
  camera,
  effectiveConnection,
}: {
  camera: CameraReadWithStatus;
  effectiveConnection?: EffectiveCameraConnection;
}) {
  const theme = useAppTheme();
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const connection = effectiveConnection?.status ?? camera.status?.connection ?? 'offline';
  const isOnline = connection === 'online';
  const thumbnailUrl = camera.preview_thumbnail_url ?? null;
  // Preview thumbnails are owner-checked, so the request has to carry credentials.
  // Null while a native token resolves, which keeps the placeholder up instead of
  // firing a spurious onError.
  const thumbnailSource = useAuthedMediaSource(thumbnailUrl);
  const hasThumbnail = isOnline && Boolean(thumbnailSource) && failedThumbnailUrl !== thumbnailUrl;
  const handleThumbnailError = useCallback(
    () => setFailedThumbnailUrl(thumbnailUrl),
    [thumbnailUrl],
  );

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
      <View style={[styles.thumbnailFrame, { backgroundColor: theme.colors.scrim }]}>
        {hasThumbnail ? (
          <Image
            source={thumbnailSource}
            style={styles.thumbnail}
            contentFit="cover"
            transition={150}
            onError={handleThumbnailError}
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            {isOnline ? (
              <>
                <View style={styles.placeholderIcon}>
                  <Icon name="image-outline" size={40} color={theme.colors.onSurfaceVariant} />
                </View>
                <AppText
                  variant="body"
                  style={[styles.thumbnailCaption, { color: theme.tokens.text.muted }]}
                >
                  No preview available
                </AppText>
              </>
            ) : (
              <>
                <View style={styles.placeholderIcon}>
                  <Icon name="camera-off" size={40} color={theme.colors.onSurfaceVariant} />
                </View>
                <AppText
                  variant="body"
                  style={[styles.thumbnailCaption, { color: theme.tokens.text.muted }]}
                >
                  Offline
                </AppText>
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardBody}>
          <AppText variant="title" numberOfLines={1}>
            {camera.name}
          </AppText>
          {camera.description ? (
            <AppText variant="body" numberOfLines={1} style={{ opacity: 0.65, marginTop: 2 }}>
              {camera.description}
            </AppText>
          ) : null}
          <View style={styles.cardChips}>
            <StatusPill
              label={STATUS_LABEL[connection]}
              tone={CONNECTION_TONE[connection]}
              variant="soft"
            />
            {isOnline ? (
              effectiveConnection?.detailLabel ? (
                <AppText variant="label" style={styles.lastSeenText}>
                  {effectiveConnection.detailLabel}
                </AppText>
              ) : (
                <TelemetryBadge telemetry={camera.telemetry} />
              )
            ) : (
              <AppText variant="label" style={styles.lastSeenText}>
                Last seen {formatLastSeen(camera.status?.last_seen_at)}
              </AppText>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

export const CameraCard = memo(CameraCardComponent);

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: radius.card,
  },
  cardOffline: {
    opacity: 0.6,
  },
  thumbnailFrame: {
    width: '100%',
    aspectRatio: 16 / 10,
    overflow: 'hidden',
    // Matches the card's own radius so the thumbnail sits flush in its corners.
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
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
  placeholderIcon: {
    opacity: 0.4,
  },
  thumbnailCaption: {},
  // Base Card has no built-in content padding (unlike Paper's Card.Content,
  // which defaulted to paddingHorizontal: 16) — added explicitly here.
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
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
