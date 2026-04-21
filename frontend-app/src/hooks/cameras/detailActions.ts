import type { Router } from 'expo-router';

type CameraDetailFeedback = {
  alert: (options: { title: string; message: string; buttons: { text: string }[] }) => void;
};

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
  closeEditName: () => void;
  closeEditDescription: () => void;
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
  camera: { id: string } | null | undefined;
  refetch: () => unknown;
  router: Pick<Router, 'replace'>;
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
    saveName: (name: string) => {
      updateMutation.mutate(
        { name },
        {
          onSuccess: dialogActions.closeEditName,
          onError: (error) => showActionError(feedback, 'Save failed', error),
        },
      );
    },
    saveDescription: (description: string) => {
      updateMutation.mutate(
        { description: description || null },
        {
          onSuccess: dialogActions.closeEditDescription,
          onError: (error) => showActionError(feedback, 'Save failed', error),
        },
      );
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
