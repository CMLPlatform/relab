import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { TextInput } from '@/components/base/TextInput';
import { radius } from '@/constants';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

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
  const theme = useAppTheme();
  const [value, setValue] = useState(initialName);
  const valid = value.trim().length >= 2 && value.trim().length <= 100;
  const hasError = value.trim().length > 0 && !valid;
  const handleSave = useCallback(() => onSave(value.trim()), [onSave, value]);

  return (
    <AppDialog visible onDismiss={onDismiss}>
      <AppText accessibilityRole="header" style={styles.title}>
        Edit name
      </AppText>
      <TextInput
        value={value}
        onChangeText={setValue}
        maxLength={100}
        autoFocus
        placeholder="Camera name"
        accessibilityLabel="Camera name"
        style={[
          styles.input,
          {
            borderColor: hasError ? theme.tokens.status.danger : theme.colors.outline,
            backgroundColor: hasError ? theme.colors.errorContainer : undefined,
            color: hasError ? theme.colors.onErrorContainer : undefined,
          },
        ]}
      />
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={onDismiss} disabled={loading}>
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          onPress={handleSave}
          disabled={!valid || loading}
          loading={loading}
        >
          Save
        </AppButton>
      </View>
    </AppDialog>
  );
}

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
  const theme = useAppTheme();
  const [value, setValue] = useState(initialDescription);
  const handleSave = useCallback(() => onSave(value.trim()), [onSave, value]);

  return (
    <AppDialog visible onDismiss={onDismiss}>
      <AppText accessibilityRole="header" style={styles.title}>
        Edit description
      </AppText>
      <TextInput
        value={value}
        onChangeText={setValue}
        maxLength={500}
        multiline
        numberOfLines={3}
        autoFocus
        placeholder="Description"
        accessibilityLabel="Description"
        style={[styles.input, styles.multilineInput, { borderColor: theme.colors.outline }]}
      />
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={onDismiss} disabled={loading}>
          Cancel
        </AppButton>
        <AppButton variant="primary" onPress={handleSave} disabled={loading} loading={loading}>
          Save
        </AppButton>
      </View>
    </AppDialog>
  );
}

type ManualSetupDialogProps = {
  visible: boolean;
  localUrlInput: string;
  localKeyInput: string;
  saving: boolean;
  onDismiss: () => void;
  onChangeUrl: (value: string) => void;
  onChangeKey: (value: string) => void;
  onConnect: () => void;
};

function ManualSetupDialog({
  visible,
  localUrlInput,
  localKeyInput,
  saving,
  onDismiss,
  onChangeUrl,
  onChangeKey,
  onConnect,
}: ManualSetupDialogProps) {
  const theme = useAppTheme();
  return (
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <AppText accessibilityRole="header" style={styles.title}>
        Manual direct connection
      </AppText>
      <View style={styles.dialogContent}>
        <AppText style={styles.connectionHint}>
          Direct connection bypasses the WebSocket relay, cutting preview latency from ~2 s to ~0.4
          s. Connect an Ethernet cable between the Pi and this device — the app detects it
          automatically. Use this form only if auto-detection didn&apos;t find the Pi; the local API
          key is on the Pi&apos;s /setup page.
        </AppText>
        <TextInput
          value={localUrlInput}
          onChangeText={onChangeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="Pi API URL (e.g. http://192.168.7.1:8018)"
          accessibilityLabel="Pi API URL"
          style={[styles.input, { borderColor: theme.colors.outline }]}
        />
        <TextInput
          value={localKeyInput}
          onChangeText={onChangeKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Local API key"
          accessibilityLabel="Local API key"
          style={[styles.input, { borderColor: theme.colors.outline }]}
        />
      </View>
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={onDismiss} disabled={saving}>
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          onPress={onConnect}
          loading={saving}
          disabled={!(localUrlInput.trim() && localKeyInput.trim()) || saving}
        >
          Connect
        </AppButton>
      </View>
    </AppDialog>
  );
}

type CameraDeleteDialogProps = {
  visible: boolean;
  cameraName: string;
  loading: boolean;
  onDismiss: () => void;
  onConfirmDelete: () => void;
};

function CameraDeleteDialog({
  visible,
  cameraName,
  loading,
  onDismiss,
  onConfirmDelete,
}: CameraDeleteDialogProps) {
  return (
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <AppText accessibilityRole="header" style={styles.title}>
        Delete camera?
      </AppText>
      <AppText>
        This will permanently delete <AppText style={styles.boldText}>{cameraName}</AppText> and
        revoke its device credential. The Raspberry Pi will lose access immediately.
      </AppText>
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={onDismiss} disabled={loading}>
          Cancel
        </AppButton>
        <AppButton variant="destructive" onPress={onConfirmDelete} loading={loading}>
          Delete
        </AppButton>
      </View>
    </AppDialog>
  );
}

type CameraDetailDialogsProps = {
  camera: CameraReadWithStatus;
  editNameVisible: boolean;
  editDescriptionVisible: boolean;
  deleteVisible: boolean;
  localSetupVisible: boolean;
  localUrlInput: string;
  localKeyInput: string;
  updateLoading: boolean;
  deleteLoading: boolean;
  localSetupSaving: boolean;
  onDismissEditName: () => void;
  onDismissEditDescription: () => void;
  onDismissDelete: () => void;
  onDismissLocalSetup: () => void;
  onSaveName: (name: string) => void;
  onSaveDescription: (description: string) => void;
  onDeleteCamera: () => void;
  onChangeLocalUrl: (value: string) => void;
  onChangeLocalKey: (value: string) => void;
  onConnectLocal: () => void;
};

export function CameraDetailDialogs({
  camera,
  editNameVisible,
  editDescriptionVisible,
  deleteVisible,
  localSetupVisible,
  localUrlInput,
  localKeyInput,
  updateLoading,
  deleteLoading,
  localSetupSaving,
  onDismissEditName,
  onDismissEditDescription,
  onDismissDelete,
  onDismissLocalSetup,
  onSaveName,
  onSaveDescription,
  onDeleteCamera,
  onChangeLocalUrl,
  onChangeLocalKey,
  onConnectLocal,
}: CameraDetailDialogsProps) {
  return (
    <>
      {editNameVisible ? (
        <EditNameDialog
          initialName={camera.name}
          onSave={onSaveName}
          onDismiss={onDismissEditName}
          loading={updateLoading}
        />
      ) : null}

      {editDescriptionVisible ? (
        <EditDescriptionDialog
          initialDescription={camera.description ?? ''}
          onSave={onSaveDescription}
          onDismiss={onDismissEditDescription}
          loading={updateLoading}
        />
      ) : null}

      <CameraDeleteDialog
        visible={deleteVisible}
        cameraName={camera.name}
        loading={deleteLoading}
        onDismiss={onDismissDelete}
        onConfirmDelete={onDeleteCamera}
      />

      <ManualSetupDialog
        visible={localSetupVisible}
        localUrlInput={localUrlInput}
        localKeyInput={localKeyInput}
        saving={localSetupSaving}
        onDismiss={onDismissLocalSetup}
        onChangeUrl={onChangeLocalUrl}
        onChangeKey={onChangeLocalKey}
        onConnect={onConnectLocal}
      />
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dialogContent: {
    gap: 12,
  },
  connectionHint: {
    opacity: 0.7,
    fontSize: 13,
  },
  boldText: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 16,
  },
});
