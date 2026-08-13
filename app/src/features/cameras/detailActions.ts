import type { ImperativeRouter } from 'expo-router';
import type { useAppFeedback } from '@/hooks/useAppFeedback';

type CameraDetailFeedback = Pick<ReturnType<typeof useAppFeedback>, 'alert' | 'input'>;

type UpdateMutation = {
  isPending: boolean;
  mutate: (
    data: { name?: string; description?: string | null },
    options?: {
      onSuccess?: () => void;
      onError?: (error: unknown) => void;
    },
  ) => void;
};

type DeleteMutation = {
  isPending: boolean;
  mutate: (
    id: string,
    options?: {
      onSuccess?: () => void;
      onError?: (error: unknown) => void;
    },
  ) => void;
};

type CameraDetailDialogsState = {
  localUrlInput: string;
  localKeyInput: string;
};

type CameraDetailDialogActions = {
  closeManualSetup: () => void;
  setLocalSetupSaving: (saving: boolean) => void;
};

type CameraDetailLocalConnection = {
  configure: (baseUrl: string, apiKey: string) => Promise<unknown>;
  clearLocalConnection: () => Promise<unknown> | undefined;
};

function showActionError(
  feedback: CameraDetailFeedback,
  title: 'Save failed' | 'Delete failed',
  error: unknown,
) {
  feedback.alert({
    title,
    message: String(error),
    buttons: [{ text: 'OK' }],
  });
}

export function createCameraDetailActions({
  camera,
  refetch,
  router,
  feedback,
  localConnection,
  dialogs,
  dialogActions,
  updateMutation,
  deleteMutation,
}: {
  camera: { id: string; name: string; description?: string | null } | null | undefined;
  refetch: () => unknown;
  router: Pick<ImperativeRouter, 'replace'>;
  feedback: CameraDetailFeedback;
  localConnection: CameraDetailLocalConnection;
  dialogs: CameraDetailDialogsState;
  dialogActions: CameraDetailDialogActions;
  updateMutation: UpdateMutation;
  deleteMutation: DeleteMutation;
}) {
  const disconnectLocal = async () => localConnection.clearLocalConnection();

  return {
    refresh: () => refetch(),
    disconnectLocal,
    promptRename: () => {
      if (!camera) return;
      feedback.input({
        title: 'Edit name',
        defaultValue: camera.name,
        placeholder: 'Camera name',
        helperText: '2-100 characters',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            // maxLength isn't part of DialogOptions, so the 2-100 bound (previously
            // enforced live via the TextInput) is gated here instead.
            disabled: (value) => {
              const trimmed = (value ?? '').trim();
              return trimmed.length < 2 || trimmed.length > 100;
            },
            onPress: (value) => {
              updateMutation.mutate(
                { name: (value ?? '').trim() },
                { onError: (error) => showActionError(feedback, 'Save failed', error) },
              );
            },
          },
        ],
      });
    },
    promptEditDescription: () => {
      if (!camera) return;
      feedback.input({
        title: 'Edit description',
        defaultValue: camera.description ?? '',
        placeholder: 'Description',
        helperText: 'Up to 500 characters',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            disabled: (value) => (value ?? '').trim().length > 500,
            onPress: (value) => {
              const description = (value ?? '').trim();
              updateMutation.mutate(
                { description: description || null },
                { onError: (error) => showActionError(feedback, 'Save failed', error) },
              );
            },
          },
        ],
      });
    },
    deleteCamera: () => {
      if (!camera) return;
      deleteMutation.mutate(camera.id, {
        onSuccess: () => {
          router.replace('/cameras');
        },
        onError: (error) => showActionError(feedback, 'Delete failed', error),
      });
    },
    connectLocal: async () => {
      dialogActions.setLocalSetupSaving(true);
      try {
        await localConnection.configure(dialogs.localUrlInput.trim(), dialogs.localKeyInput.trim());
        dialogActions.closeManualSetup();
      } catch {
        // probe result is shown via connection mode; no extra alert needed
      } finally {
        dialogActions.setLocalSetupSaving(false);
      }
    },
  };
}
