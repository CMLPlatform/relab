import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import {
  Button,
  Chip,
  Dialog,
  Divider,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import QrScanner, { requestCameraAccess } from '@/components/cameras/QrScanner';
import { API_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import { useClaimPairingMutation, useCreateCameraMutation } from '@/hooks/useRpiCameras';
import type { CameraReadWithCredentials, ConnectionMode } from '@/services/api/rpiCamera';

// ─── Credentials dialog (shown after manual creation) ────────────────────────

function CredentialsDialog({
  camera,
  onDismiss,
}: {
  camera: CameraReadWithCredentials;
  onDismiss: () => void;
}) {
  const wsBackendUrl = `${API_URL.replace(/^http/, 'ws')}/plugins/rpi-cam/ws/connect`;
  const isWebSocket = camera.connection_mode === 'websocket';

  const credentialsJson = JSON.stringify(
    {
      relay_backend_url: wsBackendUrl,
      relay_camera_id: camera.id,
      relay_api_key: camera.api_key,
    },
    null,
    2,
  );

  return (
    <Dialog visible onDismiss={onDismiss}>
      <Dialog.Title>Camera registered</Dialog.Title>
      <Dialog.ScrollArea style={{ maxHeight: 420 }}>
        <ScrollView>
          {isWebSocket ? (
            <>
              <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                Save this as{' '}
                <Text style={{ fontFamily: 'monospace', fontWeight: '700' }}>
                  relay_credentials.json
                </Text>{' '}
                in your Raspberry Pi camera plugin directory, then restart the service:
              </Text>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText} selectable>
                  {credentialsJson}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                Add this API key to your Raspberry Pi .env file:
              </Text>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText} selectable>
                  AUTHORIZED_API_KEYS=["{camera.api_key}"]
                </Text>
              </View>
            </>
          )}

          <Text variant="bodySmall" style={{ marginTop: 16, opacity: 0.55 }}>
            Store the API key safely — it will not be shown again.
          </Text>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Done</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddCameraScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const createMutation = useCreateCameraMutation();
  const claimMutation = useClaimPairingMutation();

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('websocket');
  const [url, setUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [manualSetup, setManualSetup] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [createdCamera, setCreatedCamera] = useState<CameraReadWithCredentials | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState(false);

  const isWebSocket = connectionMode === 'websocket';
  const isPairingFlow = isWebSocket && !manualSetup;

  const canSubmitPairing =
    pairingCode.length === 6 && /^[A-Z0-9]{6}$/.test(pairingCode) && name.trim().length >= 2;
  const canSubmitManual =
    name.trim().length >= 2 &&
    name.trim().length <= 100 &&
    (isWebSocket || url.trim().startsWith('http'));

  const handlePair = () => {
    claimMutation.mutate(
      {
        code: pairingCode,
        camera_name: name.trim(),
        description: description.trim() || null,
      },
      {
        onSuccess: () => setPairingSuccess(true),
        onError: (err) => alert(String(err)),
      },
    );
  };

  const handleManualCreate = () => {
    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        connection_mode: connectionMode,
        url: isWebSocket ? null : url.trim() || null,
      },
      {
        onSuccess: (camera) => setCreatedCamera(camera),
        onError: (err) => alert(String(err)),
      },
    );
  };

  const handleCredentialsDismiss = () => {
    setCreatedCamera(null);
    router.replace('/cameras');
  };

  const handlePairingSuccessDismiss = () => {
    setPairingSuccess(false);
    router.replace('/cameras');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Connection mode toggle */}
      <Text variant="labelMedium" style={styles.sectionLabel}>
        CONNECTION MODE
      </Text>
      <View style={styles.modeRow}>
        <ModeCard
          icon="access-point"
          title="WebSocket"
          subtitle="Recommended. RPi connects outbound — no public IP needed."
          selected={isWebSocket}
          onPress={() => {
            setConnectionMode('websocket');
            setManualSetup(false);
          }}
          theme={theme}
        />
        <ModeCard
          icon="lan-connect"
          title="Direct HTTP"
          subtitle="Backend sends HTTP requests to the camera URL. Camera must be reachable."
          selected={!isWebSocket}
          onPress={() => setConnectionMode('http')}
          theme={theme}
        />
      </View>

      <Divider style={styles.divider} />

      {/* ── WebSocket: Pairing flow (default) ─────────────────────────── */}
      {isPairingFlow && (
        <>
          <Text variant="labelMedium" style={styles.sectionLabel}>
            PAIRING CODE
          </Text>
          <Text variant="bodySmall" style={{ opacity: 0.6, marginBottom: 8 }}>
            Enter the 6-character code shown on your Raspberry Pi setup page.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <TextInput
              mode="outlined"
              label="Pairing code"
              value={pairingCode}
              onChangeText={(v) =>
                setPairingCode(
                  v
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              maxLength={6}
              autoCapitalize="characters"
              style={[
                styles.input,
                { flex: 1, fontFamily: 'monospace', letterSpacing: 4, fontSize: 20 },
              ]}
              contentStyle={{ textAlign: 'center' }}
            />
            {/* Show scan button on native + mobile web (touch devices), not desktop web */}
            {(Platform.OS !== 'web' ||
              (typeof window !== 'undefined' &&
                window.matchMedia('(pointer: coarse)').matches)) && (
              <Button
                mode="outlined"
                icon="qrcode-scan"
                onPress={async () => {
                  const granted = await requestCameraAccess();
                  if (granted) {
                    setScannerVisible(true);
                  } else {
                    alert(
                      'Camera access denied. Make sure you are on HTTPS or localhost, ' +
                        'and allow camera access when prompted. ' +
                        'You can also type the 6-character code manually.',
                    );
                  }
                }}
                style={{ marginTop: 6 }}
                contentStyle={{ paddingVertical: 8 }}
              >
                Scan
              </Button>
            )}
          </View>

          <Divider style={styles.divider} />
        </>
      )}

      {/* ── Common fields ─────────────────────────────────────────────── */}
      <TextInput
        label="Camera name *"
        mode="outlined"
        value={name}
        onChangeText={setName}
        maxLength={100}
        autoCapitalize="words"
        style={styles.input}
        error={name.trim().length > 0 && name.trim().length < 2}
      />

      <TextInput
        label="Description (optional)"
        mode="outlined"
        value={description}
        onChangeText={setDescription}
        maxLength={500}
        multiline
        numberOfLines={2}
        style={styles.input}
      />

      {/* ── HTTP-only: URL field ──────────────────────────────────────── */}
      {!isWebSocket && (
        <TextInput
          label="Camera URL *"
          mode="outlined"
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.x.x:8018"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          error={url.trim().length > 0 && !url.trim().startsWith('http')}
        />
      )}

      {/* ── Manual setup: WebSocket without pairing ──────────────────── */}
      {isWebSocket && !manualSetup && (
        <Button
          mode="text"
          compact
          onPress={() => setManualSetup(true)}
          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
        >
          Manual setup instead
        </Button>
      )}
      {isWebSocket && manualSetup && (
        <Button
          mode="text"
          compact
          onPress={() => setManualSetup(false)}
          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
        >
          Use pairing code
        </Button>
      )}

      {/* ── Info box ──────────────────────────────────────────────────── */}
      {isPairingFlow && (
        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information-outline"
            size={18}
            color={theme.colors.primary}
          />
          <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
            Make sure your Raspberry Pi is powered on and has{' '}
            <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>PAIRING_BACKEND_URL</Text> set
            in its .env file. The pairing code appears on the RPi setup page.
          </Text>
        </View>
      )}

      {isWebSocket && manualSetup && (
        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information-outline"
            size={18}
            color={theme.colors.primary}
          />
          <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
            After registration you will receive the camera ID and API key. Add them to the Raspberry
            Pi .env file and restart the camera service.
          </Text>
        </View>
      )}

      {/* ── Submit button ─────────────────────────────────────────────── */}
      {isPairingFlow ? (
        <Button
          mode="contained"
          icon="link-variant"
          onPress={handlePair}
          loading={claimMutation.isPending}
          disabled={!canSubmitPairing || claimMutation.isPending}
          style={styles.submitButton}
          contentStyle={{ paddingVertical: 6 }}
        >
          Pair camera
        </Button>
      ) : (
        <Button
          mode="contained"
          onPress={handleManualCreate}
          loading={createMutation.isPending}
          disabled={!canSubmitManual || createMutation.isPending}
          style={styles.submitButton}
          contentStyle={{ paddingVertical: 6 }}
        >
          Register camera
        </Button>
      )}

      {/* ── Dialogs & scanner ─────────────────────────────────────────── */}
      <Portal>
        {createdCamera && (
          <CredentialsDialog camera={createdCamera} onDismiss={handleCredentialsDismiss} />
        )}

        <Dialog visible={pairingSuccess} onDismiss={handlePairingSuccessDismiss}>
          <Dialog.Content style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
            <MaterialCommunityIcons name="check-circle" size={56} color="#2e7d32" />
            <Text variant="titleMedium">Camera paired</Text>
            <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
              Your camera should come online within a few seconds.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handlePairingSuccessDismiss}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <QrScanner
        visible={scannerVisible}
        onScanned={(code) => setPairingCode(code)}
        onClose={() => setScannerVisible(false)}
      />
    </ScrollView>
  );
}

function ModeCard({
  icon,
  title,
  subtitle,
  selected,
  onPress,
  theme,
}: {
  icon: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  theme: MD3Theme;
}) {
  return (
    <Chip
      selected={selected}
      onPress={onPress}
      style={[styles.modeChip, selected && { borderColor: theme.colors.primary, borderWidth: 1.5 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.modeChipInner}>
        <MaterialCommunityIcons
          name={icon as never}
          size={22}
          color={selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
        />
        <View style={{ flex: 1 }}>
          <Text
            variant="labelLarge"
            style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}
          >
            {title}
          </Text>
          <Text variant="bodySmall" style={{ opacity: 0.65, flexShrink: 1 }}>
            {subtitle}
          </Text>
        </View>
      </View>
    </Chip>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  sectionLabel: {
    opacity: 0.5,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  modeRow: {
    gap: 8,
  },
  modeChip: {
    borderRadius: 12,
    height: 'auto' as never,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  modeChipInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  divider: {
    marginVertical: 4,
  },
  input: {
    marginBottom: 4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(100,100,255,0.07)',
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 8,
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
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 6,
  },
});
