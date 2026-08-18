import type { RefObject } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogTitleStyle } from '@/components/base/dialogStyles';
import { TextInput } from '@/components/base/TextInput';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

type ManualSetupDialogProps = {
  visible: boolean;
  localUrlInput: string;
  localKeyInput: string;
  saving: boolean;
  onDismiss: () => void;
  onChangeUrl: (value: string) => void;
  onChangeKey: (value: string) => void;
  onConnect: () => void;
  triggerRef?: RefObject<View | null>;
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
  triggerRef,
}: ManualSetupDialogProps) {
  return (
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={triggerRef}>
      <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
        Manual direct connection
      </AppText>
      <View className="gap-3">
        <AppText variant="caption" className="text-muted-foreground">
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
          bordered
        />
        <TextInput
          value={localKeyInput}
          onChangeText={onChangeKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Local API key"
          accessibilityLabel="Local API key"
          bordered
        />
      </View>
      <View className="mt-4 flex-row justify-end gap-1">
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
  triggerRef?: RefObject<View | null>;
};

function CameraDeleteDialog({
  visible,
  cameraName,
  loading,
  onDismiss,
  onConfirmDelete,
  triggerRef,
}: CameraDeleteDialogProps) {
  return (
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={triggerRef}>
      <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
        Delete camera?
      </AppText>
      <AppText>
        This will permanently delete <AppText className="font-bold">{cameraName}</AppText> and
        revoke its device credential. The Raspberry Pi will lose access immediately.
      </AppText>
      <View className="mt-4 flex-row justify-end gap-1">
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
  deleteVisible: boolean;
  localSetupVisible: boolean;
  localUrlInput: string;
  localKeyInput: string;
  deleteLoading: boolean;
  localSetupSaving: boolean;
  onDismissDelete: () => void;
  onDismissLocalSetup: () => void;
  onDeleteCamera: () => void;
  onChangeLocalUrl: (value: string) => void;
  onChangeLocalKey: (value: string) => void;
  onConnectLocal: () => void;
  deleteTriggerRef?: RefObject<View | null>;
  manualSetupTriggerRef?: RefObject<View | null>;
};

export function CameraDetailDialogs({
  camera,
  deleteVisible,
  localSetupVisible,
  localUrlInput,
  localKeyInput,
  deleteLoading,
  localSetupSaving,
  onDismissDelete,
  onDismissLocalSetup,
  onDeleteCamera,
  onChangeLocalUrl,
  onChangeLocalKey,
  onConnectLocal,
  deleteTriggerRef,
  manualSetupTriggerRef,
}: CameraDetailDialogsProps) {
  return (
    <>
      <CameraDeleteDialog
        visible={deleteVisible}
        cameraName={camera.name}
        loading={deleteLoading}
        onDismiss={onDismissDelete}
        onConfirmDelete={onDeleteCamera}
        triggerRef={deleteTriggerRef}
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
        triggerRef={manualSetupTriggerRef}
      />
    </>
  );
}
