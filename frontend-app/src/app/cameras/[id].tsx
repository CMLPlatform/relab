import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { LivePreview } from '@/components/cameras/LivePreview';
import { YouTubeStreamCard } from '@/components/cameras/YouTubeStreamCard';
import { useAuth } from '@/context/AuthProvider';
import { useLocalConnection } from '@/hooks/useLocalConnection';
import {
  useCameraQuery,
  useDeleteCameraMutation,
  useUpdateCameraMutation,
} from '@/hooks/useRpiCameras';
import type { CameraConnectionStatus } from '@/services/api/rpiCamera';

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
  const localConnection = useLocalConnection(id ?? '');

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editDescVisible, setEditDescVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [localSetupVisible, setLocalSetupVisible] = useState(false);
  const [localUrlInput, setLocalUrlInput] = useState('');
  const [localKeyInput, setLocalKeyInput] = useState('');
  const [localSetupSaving, setLocalSetupSaving] = useState(false);

  const isOnline = camera?.status?.connection === 'online';

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
      onSuccess: () => {
        router.replace('/cameras');
      },
      onError: (error) => {
        alert(String(error));
      },
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
            {camera.status?.connection === 'offline' && (
              <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 4 }}>
                Waiting for camera to connect via WebSocket relay.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Live preview — LL-HLS, direct (local mode) or via relay. */}
        {(isOnline || localConnection.mode === 'local') && (
          <LivePreview camera={camera} connectionInfo={localConnection} />
        )}

        {/* YouTube streaming status — only shown when online and YouTube integration is enabled. */}
        {isOnline && <YouTubeStreamCard cameraId={camera.id} isOnline={isOnline} />}

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
            <DetailRow label="Relay" value="WebSocket" />
            <Divider />
            <DetailRow label="Key ID" value={camera.relay_key_id} mono />
            <Divider />
            <DetailRow label="Camera ID" value={camera.id} mono />
          </Card.Content>
        </Card>

        {/* Connection mode info */}
        <Card style={styles.card}>
          <Card.Content style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {localConnection.mode === 'local' ? (
                <>
                  <MaterialCommunityIcons name="ethernet" size={20} color="#2e7d32" />
                  <Text variant="titleSmall" style={{ color: '#2e7d32' }}>
                    Direct · &lt;1 s
                  </Text>
                </>
              ) : localConnection.mode === 'probing' ? (
                <>
                  <ActivityIndicator size={16} />
                  <Text variant="titleSmall" style={{ opacity: 0.6 }}>
                    Checking for direct connection…
                  </Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="access-point"
                    size={20}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text variant="titleSmall">WebSocket relay</Text>
                </>
              )}
              <View style={{ flex: 1 }} />
              {localConnection.mode === 'local' ? (
                <Button
                  compact
                  mode="text"
                  onPress={() => void localConnection.clearLocalConnection()}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  compact
                  mode="text"
                  onPress={() => {
                    setLocalUrlInput(localConnection.localBaseUrl ?? '');
                    setLocalKeyInput('');
                    setLocalSetupVisible(true);
                  }}
                >
                  Set up direct
                </Button>
              )}
            </View>
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>
              {localConnection.mode === 'local'
                ? `Connected directly via Ethernet/USB-C to ${localConnection.localBaseUrl ?? ''}`
                : 'Camera connects outbound to the backend. No public IP required.'}
            </Text>
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

        <Dialog visible={deleteVisible} onDismiss={() => setDeleteVisible(false)}>
          <Dialog.Title>Delete camera?</Dialog.Title>
          <Dialog.Content>
            <Text>
              This will permanently delete <Text style={{ fontWeight: 'bold' }}>{camera.name}</Text>{' '}
              and revoke its device credential. The Raspberry Pi will lose access immediately.
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

        <Dialog visible={localSetupVisible} onDismiss={() => setLocalSetupVisible(false)}>
          <Dialog.Title>Set up direct connection</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodySmall" style={{ opacity: 0.7 }}>
              Connect an Ethernet cable (or USB-C to Ethernet adapter) between the Pi and this
              device. Enable LOCAL_MODE_ENABLED=true on the Pi, then copy the API key from the
              Pi&apos;s /setup page.
            </Text>
            <TextInput
              mode="outlined"
              label="Pi API URL"
              placeholder="http://192.168.7.1:8018"
              value={localUrlInput}
              onChangeText={setLocalUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              mode="outlined"
              label="Local API key"
              placeholder="local_…"
              value={localKeyInput}
              onChangeText={setLocalKeyInput}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLocalSetupVisible(false)} disabled={localSetupSaving}>
              Cancel
            </Button>
            <Button
              onPress={async () => {
                setLocalSetupSaving(true);
                try {
                  await localConnection.configure(localUrlInput.trim(), localKeyInput.trim());
                  setLocalSetupVisible(false);
                } catch {
                  // probe result is shown via mode state; nothing extra needed
                } finally {
                  setLocalSetupSaving(false);
                }
              }}
              loading={localSetupSaving}
              disabled={!localUrlInput.trim() || !localKeyInput.trim() || localSetupSaving}
            >
              Connect
            </Button>
          </Dialog.Actions>
        </Dialog>
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.45,
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
});
