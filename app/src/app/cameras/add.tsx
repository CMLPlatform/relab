import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Controller } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, Portal, Text, TextInput } from 'react-native-paper';
import { MutedText } from '@/components/base/MutedText';
import { sanitizePairingCode, useAddCameraForm } from '@/features/cameras/useAddCameraForm';
import { useAppTheme } from '@/theme';

function PairingSuccessDialog({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const theme = useAppTheme();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Content style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <MaterialCommunityIcons
            name="check-circle"
            size={56}
            color={theme.tokens.status.success}
          />
          <Text variant="titleMedium">Camera paired</Text>
          <MutedText style={{ textAlign: 'center', opacity: 0.7 }}>
            Your camera should come online within a few seconds.
          </MutedText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export default function AddCameraScreen() {
  const theme = useAppTheme();
  const { user, control, submit, isPending, pairingSuccess, dismissSuccess } = useAddCameraForm();

  const renderPairingCode = useCallback(
    ({
      field: { value, onChange },
    }: {
      field: { value: string; onChange: (text: string) => void };
    }) => (
      <TextInput
        mode="outlined"
        label="Pairing code"
        value={value}
        // biome-ignore lint/performance/noJsxPropsBind: transform-on-change needs the per-field onChange; the row only rerenders when its own value changes.
        onChangeText={(v) => onChange(sanitizePairingCode(v))}
        maxLength={6}
        autoCapitalize="characters"
        style={[styles.input, { fontFamily: 'monospace', fontSize: 20 }]}
        contentStyle={{ textAlign: 'center' }}
      />
    ),
    [],
  );

  const renderName = useCallback(
    ({
      field: { value, onChange },
      fieldState: { error },
    }: {
      field: { value: string; onChange: (text: string) => void };
      fieldState: { error?: unknown };
    }) => (
      <TextInput
        label="Camera name *"
        mode="outlined"
        value={value}
        onChangeText={onChange}
        maxLength={100}
        autoCapitalize="words"
        style={styles.input}
        error={Boolean(error) && value.trim().length > 0}
      />
    ),
    [],
  );

  const renderDescription = useCallback(
    ({
      field: { value, onChange },
    }: {
      field: { value: string | undefined; onChange: (text: string) => void };
    }) => (
      <TextInput
        label="Description (optional)"
        mode="outlined"
        value={value ?? ''}
        onChangeText={onChange}
        maxLength={500}
        multiline
        numberOfLines={2}
        style={styles.input}
      />
    ),
    [],
  );

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="labelMedium" style={styles.sectionLabel}>
        PAIRING CODE
      </Text>
      <MutedText style={styles.sectionHelp}>
        Enter the 6-character code shown on your Raspberry Pi setup page, or read the boxed “PAIRING
        READY” banner over SSH if the device is headless.
      </MutedText>
      <Controller control={control} name="pairingCode" render={renderPairingCode} />

      <Divider style={styles.divider} />

      <Controller control={control} name="name" render={renderName} />

      <Controller control={control} name="description" render={renderDescription} />

      <View style={[styles.infoBox, { backgroundColor: theme.tokens.surface.accent }]}>
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
        onPress={submit}
        loading={isPending}
        disabled={isPending}
        style={styles.submitButton}
        contentStyle={{ paddingVertical: 6 }}
      >
        Pair camera
      </Button>

      <PairingSuccessDialog visible={pairingSuccess} onDismiss={dismissSuccess} />
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
  sectionHelp: {
    marginBottom: 8,
    opacity: 0.6,
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
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 8,
  },
});
