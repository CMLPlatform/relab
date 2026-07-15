import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Controller } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { MutedText } from '@/components/base/MutedText';
import { PageContainer } from '@/components/base/PageContainer';
import { TextInput } from '@/components/base/TextInput';
import { Separator } from '@/components/base/ui/separator';
import { sanitizePairingCode, useAddCameraForm } from '@/features/cameras/useAddCameraForm';
import { useAppTheme } from '@/theme';

function PairingSuccessDialog({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const theme = useAppTheme();
  return (
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <View style={styles.successContent}>
        <MaterialCommunityIcons name="check-circle" size={56} color={theme.tokens.status.success} />
        <AppText variant="title" accessibilityRole="header">
          Camera paired
        </AppText>
        <MutedText style={{ textAlign: 'center', opacity: 0.7 }}>
          Your camera should come online within a few seconds.
        </MutedText>
      </View>
      <View style={styles.dialogActions}>
        <AppButton variant="ghost" onPress={onDismiss}>
          Done
        </AppButton>
      </View>
    </AppDialog>
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
        value={value}
        // biome-ignore lint/performance/noJsxPropsBind: transform-on-change needs the per-field onChange; the row only rerenders when its own value changes.
        onChangeText={(v) => onChange(sanitizePairingCode(v))}
        maxLength={6}
        autoCapitalize="characters"
        accessibilityLabel="Pairing code"
        style={[
          styles.input,
          {
            fontFamily: 'monospace',
            fontSize: 20,
            textAlign: 'center',
            borderColor: theme.colors.outline,
          },
        ]}
      />
    ),
    [theme.colors.outline],
  );

  const renderName = useCallback(
    ({
      field: { value, onChange },
      fieldState: { error },
    }: {
      field: { value: string; onChange: (text: string) => void };
      fieldState: { error?: unknown };
    }) => {
      const hasError = Boolean(error) && value.trim().length > 0;
      return (
        <TextInput
          value={value}
          onChangeText={onChange}
          maxLength={100}
          autoCapitalize="words"
          placeholder="Camera name"
          accessibilityLabel="Camera name *"
          style={[
            styles.input,
            {
              borderColor: hasError ? theme.tokens.status.danger : theme.colors.outline,
              backgroundColor: hasError ? theme.colors.errorContainer : undefined,
              color: hasError ? theme.colors.onErrorContainer : undefined,
            },
          ]}
        />
      );
    },
    [
      theme.colors.outline,
      theme.colors.errorContainer,
      theme.colors.onErrorContainer,
      theme.tokens.status.danger,
    ],
  );

  const renderDescription = useCallback(
    ({
      field: { value, onChange },
    }: {
      field: { value: string | undefined; onChange: (text: string) => void };
    }) => (
      <TextInput
        value={value ?? ''}
        onChangeText={onChange}
        maxLength={500}
        multiline
        numberOfLines={2}
        placeholder="Description (optional)"
        accessibilityLabel="Description (optional)"
        style={[styles.input, { borderColor: theme.colors.outline }]}
      />
    ),
    [theme.colors.outline],
  );

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <PageContainer>
        <View style={styles.form}>
          <AppText variant="label" style={styles.sectionLabel}>
            PAIRING CODE
          </AppText>
          <MutedText style={styles.sectionHelp}>
            Enter the 6-character code shown on your Raspberry Pi setup page, or read the boxed
            “PAIRING READY” banner over SSH if the device is headless.
          </MutedText>
          <Controller control={control} name="pairingCode" render={renderPairingCode} />

          <Separator style={styles.divider} />

          <AppText variant="label" style={styles.fieldLabel}>
            Camera name *
          </AppText>
          <Controller control={control} name="name" render={renderName} />

          <AppText variant="label" style={styles.fieldLabel}>
            Description (optional)
          </AppText>
          <Controller control={control} name="description" render={renderDescription} />

          <View style={[styles.infoBox, { backgroundColor: theme.tokens.surface.accent }]}>
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color={theme.colors.primary}
            />
            <AppText variant="body" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
              Make sure your Raspberry Pi is powered on and has{' '}
              <AppText style={{ fontFamily: 'monospace', fontSize: 11 }}>
                PAIRING_BACKEND_URL
              </AppText>{' '}
              set in its .env file. The pairing code appears on the RPi setup page and in the
              startup logs.
            </AppText>
          </View>

          <AppButton
            variant="primary"
            onPress={submit}
            loading={isPending}
            disabled={isPending}
            className="mt-2"
          >
            <MaterialCommunityIcons name="link-variant" size={18} color={theme.colors.onPrimary} />
            <AppText style={{ color: theme.colors.onPrimary }}>Pair camera</AppText>
          </AppButton>

          <PairingSuccessDialog visible={pairingSuccess} onDismiss={dismissSuccess} />
        </View>
      </PageContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 48,
  },
  form: {
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
  fieldLabel: {
    opacity: 0.6,
    marginBottom: -4,
  },
  divider: {
    marginVertical: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  successContent: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 24,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
});
