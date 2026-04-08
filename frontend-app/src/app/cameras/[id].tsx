import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Dialog,
  Divider,
  IconButton,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { API_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import {
  useCameraPreview,
  useCameraQuery,
  useDeleteCameraMutation,
  useRegenerateApiKeyMutation,
  useUpdateCameraMutation,
} from '@/hooks/useRpiCameras';
import type { CameraConnectionStatus, CameraReadWithCredentials } from '@/services/api/rpiCamera';

// ─── Status ───────────────────────────────────────────────────────────────────

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

// ─── API key dialog ───────────────────────────────────────────────────────────

function ApiKeyDialog({
  camera,
  onDismiss,
}: {
  camera: CameraReadWithCredentials;
  onDismiss: () => void;
}) {
  const wsBackendUrl = `${API_URL.replace(/^http/, 'ws')}/plugins/rpi-cam/ws/connect`;
  const isWebSocket = camera.connection_mode === 'websocket';

  return (
    <Dialog visible onDismiss={onDismiss}>
      <Dialog.Title>New API key</Dialog.Title>
      <Dialog.ScrollArea style={{ maxHeight: 380 }}>
        <ScrollView>
          <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
            Update your Raspberry Pi .env with the new credentials:
          </Text>

          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {isWebSocket
                ? [
                    `RELAY_ENABLED=true`,
                    `RELAY_BACKEND_URL=${wsBackendUrl}`,
                    `RELAY_CAMERA_ID=${camera.id}`,
                    `RELAY_API_KEY=${camera.api_key}`,
                  ].join('\n')
                : `AUTHORIZED_API_KEYS=${camera.api_key}`}
            </Text>
          </View>

          <Text variant="bodySmall" style={{ marginTop: 12, opacity: 0.55 }}>
            Store the key safely — it will not be shown again.
          </Text>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Done</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

// ─── Edit name dialog ─────────────────────────────────────────────────────────

function EditNameDialog({
  initialName,
  onSave,
  onDismiss,
  loading,
}: {
  initialName: string;
  onSave: (name: string) => void;
  onDismiss: () => void;
  loading: boolean;
}) {
  const [value, setValue] = useState(initialName);
  const valid = value.trim().length >= 2 && value.trim().length <= 100;

  return (
    <Dialog visible onDismiss={onDismiss}>
      <Dialog.Title>Edit name</Dialog.Title>
      <Dialog.Content>
        <TextInput
          mode="outlined"
          label="Camera name"
          value={value}
          onChangeText={setValue}
          maxLength={100}
          autoFocus
          error={value.trim().length > 0 && !valid}
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} disabled={loading}>
          Cancel
        </Button>
        <Button onPress={() => onSave(value.trim())} disabled={!valid || loading} loading={loading}>
          Save
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

// ─── Edit description dialog ──────────────────────────────────────────────────

function EditDescriptionDialog({
  initialDescription,
  onSave,
  onDismiss,
  loading,
}: {
  initialDescription: string;
  onSave: (description: string) => void;
  onDismiss: () => void;
  loading: boolean;
}) {
  const [value, setValue] = useState(initialDescription);

  return (
    <Dialog visible onDismiss={onDismiss}>
      <Dialog.Title>Edit description</Dialog.Title>
      <Dialog.Content>
        <TextInput
          mode="outlined"
          label="Description"
          value={value}
          onChangeText={setValue}
          maxLength={500}
          multiline
          numberOfLines={3}
          autoFocus
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} disabled={loading}>
          Cancel
        </Button>
        <Button onPress={() => onSave(value.trim())} disabled={loading} loading={loading}>
          Save
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CameraDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { user } = useAuth();

  const {
    data: camera,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCameraQuery(id ?? '', true);

  const updateMutation = useUpdateCameraMutation(id ?? '');
  const deleteMutation = useDeleteCameraMutation();
  const regenerateMutation = useRegenerateApiKeyMutation(id ?? '');

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editDescVisible, setEditDescVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [regenerateVisible, setRegenerateVisible] = useState(false);
  const [newCredentials, setNewCredentials] = useState<CameraReadWithCredentials | null>(null);

  const isOnline = camera?.status?.connection === 'online';
  const { snapshotUrl, error: previewError } = useCameraPreview(
    isOnline && camera ? camera : null,
    { enabled: !!isOnline },
  );

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);

  useEffect(() => {
    navigation.setOptions({ title: camera?.name ?? 'Camera' });
  }, [navigation, camera?.name]);

  if (!user) return null;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !camera) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={{ marginTop: 12, textAlign: 'center' }}>
          {String(error) || 'Camera not found.'}
        </Text>
        <Button mode="contained" onPress={() => refetch()} style={{ marginTop: 16 }}>
          Retry
        </Button>
      </View>
    );
  }

  const statusColor = camera.status ? STATUS_COLOR[camera.status.connection] : STATUS_COLOR.offline;
  const statusLabel = camera.status ? STATUS_LABEL[camera.status.connection] : STATUS_LABEL.offline;

  const handleSaveName = (name: string) => {
    updateMutation.mutate(
      { name },
      {
        onSuccess: () => setEditNameVisible(false),
        onError: (err) => alert(String(err)),
      },
    );
  };

  const handleSaveDescription = (description: string) => {
    updateMutation.mutate(
      { description: description || null },
      {
        onSuccess: () => setEditDescVisible(false),
        onError: (err) => alert(String(err)),
      },
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(camera.id, {
      onSuccess: () => router.replace('/cameras'),
      onError: (err) => {
        setDeleteVisible(false);
        alert(String(err));
      },
    });
  };

  const handleRegenerate = () => {
    setRegenerateVisible(false);
    regenerateMutation.mutate(undefined, {
      onSuccess: (cred) => setNewCredentials(cred),
      onError: (err) => alert(String(err)),
    });
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Status card */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text variant="titleMedium" style={{ color: statusColor }}>
                {statusLabel}
              </Text>
              <View style={{ flex: 1 }} />
              <IconButton
                icon="refresh"
                size={20}
                loading={isFetching}
                onPress={() => refetch()}
                accessibilityLabel="Refresh status"
              />
            </View>
            {camera.status?.connection === 'offline' && camera.connection_mode === 'websocket' && (
              <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 4 }}>
                Waiting for camera to connect via WebSocket relay.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Live preview — only for online cameras */}
        {isOnline && (
          <Card style={styles.card}>
            <Card.Content style={{ alignItems: 'center', gap: 8 }}>
              {previewError ? (
                <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="camera-off" size={32} color="#999" />
                  <Text style={{ color: '#999' }}>Preview unavailable</Text>
                </View>
              ) : snapshotUrl ? (
                <Image
                  source={{ uri: snapshotUrl }}
                  style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8 }}
                  contentFit="contain"
                />
              ) : (
                <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size={24} />
                  <Text style={{ color: '#999' }}>Loading preview…</Text>
                </View>
              )}
              <Text variant="bodySmall" style={{ color: '#999' }}>
                {Platform.OS === 'web' && camera.connection_mode === 'http'
                  ? 'Live preview · MJPEG'
                  : 'Live preview · polling'}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Details */}
        <Card style={styles.card}>
          <Card.Content style={styles.detailsContent}>
            <DetailRow label="Name" value={camera.name} onEdit={() => setEditNameVisible(true)} />
            <Divider />
            <DetailRow
              label="Description"
              value={camera.description ?? '—'}
              onEdit={() => setEditDescVisible(true)}
            />
            <Divider />
            <DetailRow
              label="Mode"
              value={camera.connection_mode === 'websocket' ? 'WebSocket (relay)' : 'Direct HTTP'}
            />
            {camera.url && (
              <>
                <Divider />
                <DetailRow label="URL" value={camera.url} />
              </>
            )}
            <Divider />
            <DetailRow label="Camera ID" value={camera.id} mono />
          </Card.Content>
        </Card>

        {/* Connection mode info */}
        <Card style={styles.card}>
          <Card.Content style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons
                name={camera.connection_mode === 'websocket' ? 'access-point' : 'lan-connect'}
                size={20}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="titleSmall">
                {camera.connection_mode === 'websocket' ? 'WebSocket relay' : 'Direct HTTP'}
              </Text>
            </View>
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>
              {camera.connection_mode === 'websocket'
                ? 'Camera connects outbound to the backend. No public IP required.'
                : 'Backend sends requests to the camera URL directly.'}
              {' To change connection mode, delete this camera and add a new one.'}
            </Text>
          </Card.Content>
        </Card>

        {/* Security */}
        <Text style={styles.sectionLabel}>SECURITY</Text>
        <Card style={styles.card}>
          <Card.Content>
            <ActionRow
              label="Regenerate API key"
              subtitle="Revoke the current key and issue a new one"
              icon="key-change"
              onPress={() => setRegenerateVisible(true)}
              loading={regenerateMutation.isPending}
            />
          </Card.Content>
        </Card>

        {/* Danger zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <Card style={styles.card}>
          <Card.Content>
            <ActionRow
              label="Delete camera"
              subtitle="Permanently removes this camera and all its settings"
              icon="delete"
              onPress={() => setDeleteVisible(true)}
              danger
            />
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        {editNameVisible && (
          <EditNameDialog
            initialName={camera.name}
            onSave={handleSaveName}
            onDismiss={() => setEditNameVisible(false)}
            loading={updateMutation.isPending}
          />
        )}

        {editDescVisible && (
          <EditDescriptionDialog
            initialDescription={camera.description ?? ''}
            onSave={handleSaveDescription}
            onDismiss={() => setEditDescVisible(false)}
            loading={updateMutation.isPending}
          />
        )}

        <Dialog visible={regenerateVisible} onDismiss={() => setRegenerateVisible(false)}>
          <Dialog.Title>Regenerate API key?</Dialog.Title>
          <Dialog.Content>
            <Text>
              The current API key will be invalidated immediately. Any Raspberry Pi using it will
              disconnect until you update the .env file with the new key.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRegenerateVisible(false)}>Cancel</Button>
            <Button onPress={handleRegenerate} textColor={theme.colors.error}>
              Regenerate
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={deleteVisible} onDismiss={() => setDeleteVisible(false)}>
          <Dialog.Title>Delete camera?</Dialog.Title>
          <Dialog.Content>
            <Text>
              This will permanently delete <Text style={{ fontWeight: 'bold' }}>{camera.name}</Text>{' '}
              and revoke its API key. The Raspberry Pi will lose access immediately.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteVisible(false)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              onPress={handleDelete}
              loading={deleteMutation.isPending}
              textColor={theme.colors.error}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>

        {newCredentials && (
          <ApiKeyDialog camera={newCredentials} onDismiss={() => setNewCredentials(null)} />
        )}
      </Portal>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  onEdit,
  mono = false,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  mono?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text variant="labelSmall" style={{ opacity: 0.55, width: 100 }}>
        {label}
      </Text>
      <Text
        selectable
        numberOfLines={1}
        style={[
          { flex: 1, color: theme.colors.onSurface },
          mono && { fontFamily: 'monospace', fontSize: 12 },
        ]}
      >
        {value}
      </Text>
      {onEdit && (
        <IconButton
          icon="pencil"
          size={16}
          onPress={onEdit}
          accessibilityLabel={`Edit ${label.toLowerCase()}`}
        />
      )}
    </View>
  );
}

function ActionRow({
  label,
  subtitle,
  icon,
  onPress,
  danger = false,
  loading = false,
}: {
  label: string;
  subtitle?: string;
  icon: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.colors.error : theme.colors.onSurface;

  return (
    <Button
      mode="text"
      icon={icon}
      onPress={onPress}
      loading={loading}
      disabled={loading}
      textColor={color}
      style={{ alignSelf: 'stretch' }}
      contentStyle={{ justifyContent: 'flex-start', paddingVertical: 6 }}
    >
      <View>
        <Text style={{ color, fontWeight: '600' }}>{label}</Text>
        {subtitle && (
          <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
    </Button>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    paddingBottom: 48,
    gap: 12,
  },
  card: {
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.45,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: -4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  codeBlock: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    color: '#a8e6cf',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
  },
});
