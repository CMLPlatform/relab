import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, AnimatedFAB, Button, Card, Text, useTheme } from 'react-native-paper';
import { useAuth } from '@/context/AuthProvider';
import { useCamerasQuery } from '@/hooks/useRpiCameras';
import type { CameraConnectionStatus, CameraReadWithStatus } from '@/services/api/rpiCamera';

// ─── Status badge ─────────────────────────────────────────────────────────────

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

// ─── Camera card ──────────────────────────────────────────────────────────────

function CameraCard({ camera }: { camera: CameraReadWithStatus }) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Card
      style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}
      onPress={() => router.push({ pathname: '/cameras/[id]', params: { id: camera.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Camera: ${camera.name}`}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <MaterialCommunityIcons
            name={camera.connection_mode === 'websocket' ? 'access-point' : 'lan-connect'}
            size={28}
            color={theme.colors.onSurfaceVariant}
          />
        </View>
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
            <View
              style={{
                backgroundColor: theme.colors.surfaceVariant,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 11 }}>
                {camera.connection_mode === 'websocket' ? 'WebSocket' : 'HTTP'}
              </Text>
            </View>
            {camera.status && <StatusBadge status={camera.status.connection} />}
          </View>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={theme.colors.onSurfaceVariant}
        />
      </Card.Content>
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CamerasScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();

  const { data: cameras, isLoading, isFetching, isError, error, refetch } = useCamerasQuery(true);

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);

  if (!user) return null;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={{ marginTop: 12, textAlign: 'center' }}>
          {String(error) || 'Failed to load cameras.'}
        </Text>
        <Button mode="contained" onPress={() => refetch()} style={{ marginTop: 16 }}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={cameras ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CameraCard camera={item} />}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
        contentContainerStyle={[styles.list, (!cameras || cameras.length === 0) && { flex: 1 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="camera-off"
              size={64}
              color={theme.colors.onSurfaceVariant}
              style={{ opacity: 0.4 }}
            />
            <Text variant="titleMedium" style={{ marginTop: 16, opacity: 0.6 }}>
              No cameras yet
            </Text>
            <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.5, textAlign: 'center' }}>
              Tap the + button to register your first RPi camera.
            </Text>
          </View>
        }
      />

      <AnimatedFAB
        icon="plus"
        label="Add Camera"
        extended
        onPress={() => router.push('/cameras/add')}
        style={{
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
          right: 16,
          bottom: 16,
        }}
        accessibilityLabel="Add camera"
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 12,
    paddingBottom: 88,
    gap: 10,
  },
  card: {
    borderRadius: 12,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  cardLeft: {
    width: 36,
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
});
