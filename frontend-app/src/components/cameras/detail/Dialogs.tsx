import { useState } from 'react';
import { Button, Dialog, Portal, TextInput, useTheme } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { cameraDetailStyles as styles } from './shared';

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
  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>Manual direct connection</Dialog.Title>
      <Dialog.Content style={styles.dialogContent}>
        <Text style={styles.connectionHint}>
          Direct connection bypasses the WebSocket relay, cutting preview latency from ~2 s to ~0.4
          s. Connect an Ethernet cable between the Pi and this device - the app detects it
          automatically. Use this form only if auto-detection didn&apos;t find the Pi; the local API
          key is on the Pi&apos;s /setup page.
        </Text>
        <TextInput
          mode="outlined"
          label="Pi API URL"
          placeholder="http://192.168.7.1:8018"
          value={localUrlInput}
          onChangeText={onChangeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextInput
          mode="outlined"
          label="Local API key"
          placeholder="local_…"
          value={localKeyInput}
          onChangeText={onChangeKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} disabled={saving}>
          Cancel
        </Button>
        <Button
          onPress={onConnect}
          loading={saving}
          disabled={!localUrlInput.trim() || !localKeyInput.trim() || saving}
        >
          Connect
        </Button>
      </Dialog.Actions>
    </Dialog>
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
  const theme = useTheme();

  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>Delete camera?</Dialog.Title>
      <Dialog.Content>
        <Text>
          This will permanently delete <Text style={styles.boldText}>{cameraName}</Text> and revoke
          its device credential. The Raspberry Pi will lose access immediately.
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} disabled={loading}>
          Cancel
        </Button>
        <Button onPress={onConfirmDelete} loading={loading} textColor={theme.colors.error}>
          Delete
        </Button>
      </Dialog.Actions>
    </Dialog>
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
    <Portal>
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
    </Portal>
  );
}
