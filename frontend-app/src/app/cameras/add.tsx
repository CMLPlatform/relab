import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { useAuth } from '@/context/auth';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useClaimPairingMutation } from '@/hooks/useRpiCameras';
import { ApiError } from '@/services/api/rpiCamera/shared';

const PAIRING_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const NON_ALPHANUMERIC_PAIRING_CODE_PATTERN = /[^A-Z0-9]/g;

function PairingCodeInput({
  pairingCode,
  setPairingCode,
}: {
  pairingCode: string;
  setPairingCode: (value: string) => void;
}) {
  return (
    <TextInput
      mode="outlined"
      label="Pairing code"
      value={pairingCode}
      onChangeText={(v) =>
        setPairingCode(
          v.toUpperCase().replace(NON_ALPHANUMERIC_PAIRING_CODE_PATTERN, '').slice(0, 6),
        )
      }
      maxLength={6}
      autoCapitalize="characters"
      style={[styles.input, { fontFamily: 'monospace', fontSize: 20 }]}
      contentStyle={{ textAlign: 'center' }}
    />
  );
}

function PairingSuccessDialog({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Content style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <MaterialCommunityIcons name="check-circle" size={56} color="#2e7d32" />
          <Text variant="titleMedium">Camera paired</Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
            Your camera should come online within a few seconds.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export default function AddCameraScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const claimMutation = useClaimPairingMutation();

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingSuccess, setPairingSuccess] = useState(false);

  const canSubmitPairing =
    pairingCode.length === 6 && PAIRING_CODE_PATTERN.test(pairingCode) && name.trim().length >= 2;

  const handlePair = () => {
    claimMutation.mutate(
      {
        code: pairingCode,
        camera_name: name.trim(),
        description: description.trim() || null,
      },
      {
        onSuccess: () => {
          setPairingCode('');
          setPairingSuccess(true);
        },
        onError: (err) => {
          const isCodeMissing = err instanceof ApiError && err.status === 404;
          feedback.alert({
            title: 'Pairing failed',
            message: isCodeMissing
              ? 'The pairing code was not found. Make sure the Raspberry Pi is powered on and showing a code, then try again in a few seconds.'
              : err instanceof Error
                ? err.message
                : String(err),
            buttons: [{ text: 'OK' }],
          });
        },
      },
    );
  };

  useEffect(() => () => setPairingCode(''), []);

  const handlePairingSuccessDismiss = () => {
    setPairingSuccess(false);
    router.replace('/cameras');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="labelMedium" style={styles.sectionLabel}>
        PAIRING CODE
      </Text>
      <Text variant="bodySmall" style={{ opacity: 0.6, marginBottom: 8 }}>
        Enter the 6-character code shown on your Raspberry Pi setup page, or read the boxed `PAIRING
        READY` banner over SSH if the device is headless.
      </Text>
      <PairingCodeInput pairingCode={pairingCode} setPairingCode={setPairingCode} />

      <Divider style={styles.divider} />

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

      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.primary} />
        <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
          Make sure your Raspberry Pi is powered on and has{' '}
          <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>PAIRING_BACKEND_URL</Text> set in
          its .env file. The pairing code appears on the RPi setup page and in the startup logs.
        </Text>
      </View>

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

      <PairingSuccessDialog visible={pairingSuccess} onDismiss={handlePairingSuccessDismiss} />
    </ScrollView>
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
    marginBottom: 4,
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
});
