import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useEffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import {
  useCameraQuery,
  useDeleteCameraMutation,
  useUpdateCameraMutation,
} from '@/hooks/useRpiCameras';

export function useCameraDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const feedback = useAppFeedback();
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

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editDescriptionVisible, setEditDescriptionVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [localSetupVisible, setLocalSetupVisible] = useState(false);
  const [localUrlInput, setLocalUrlInput] = useState('');
  const [localKeyInput, setLocalKeyInput] = useState('');
  const [localSetupSaving, setLocalSetupSaving] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const effectiveConnection = useEffectiveCameraConnection(camera, id ?? '');
  const { localConnection } = effectiveConnection;
  const isOnline = effectiveConnection.relayStatus === 'online';
  const canPreview = effectiveConnection.isReachable;

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [router, user]);

  useEffect(() => {
    navigation.setOptions({ title: camera?.name ?? 'Camera' });
  }, [camera?.name, navigation]);

  const showSaveFailed = (err: unknown) =>
    feedback.alert({
      title: 'Save failed',
      message: String(err),
      buttons: [{ text: 'OK' }],
    });

  return {
    screen: {
      user,
      camera,
      isLoading,
      isError,
      error,
      isFetching,
      isOnline,
      canPreview,
      effectiveConnection,
      localConnection,
      refetch,
    },
    preview: {
      enabled: previewEnabled,
    },
    dialogs: {
      editNameVisible,
      editDescriptionVisible,
      deleteVisible,
      localSetupVisible,
      localUrlInput,
      localKeyInput,
      updateLoading: updateMutation.isPending,
      deleteLoading: deleteMutation.isPending,
      localSetupSaving,
    },
    actions: {
      openEditName: () => setEditNameVisible(true),
      closeEditName: () => setEditNameVisible(false),
      openEditDescription: () => setEditDescriptionVisible(true),
      closeEditDescription: () => setEditDescriptionVisible(false),
      requestDelete: () => setDeleteVisible(true),
      closeDelete: () => setDeleteVisible(false),
      openManualSetup: () => {
        setLocalUrlInput(localConnection.localBaseUrl ?? '');
        setLocalKeyInput('');
        setLocalSetupVisible(true);
      },
      closeManualSetup: () => setLocalSetupVisible(false),
      setLocalUrl: setLocalUrlInput,
      setLocalKey: setLocalKeyInput,
      refresh: () => refetch(),
      togglePreview: () => setPreviewEnabled((enabled) => !enabled),
      disconnectLocal: () => void localConnection.clearLocalConnection(),
      saveName: (name: string) => {
        updateMutation.mutate(
          { name },
          {
            onSuccess: () => setEditNameVisible(false),
            onError: showSaveFailed,
          },
        );
      },
      saveDescription: (description: string) => {
        updateMutation.mutate(
          { description: description || null },
          {
            onSuccess: () => setEditDescriptionVisible(false),
            onError: showSaveFailed,
          },
        );
      },
      deleteCamera: () => {
        if (!camera) return;
        deleteMutation.mutate(camera.id, {
          onSuccess: () => {
            router.replace('/cameras');
          },
          onError: (mutationError) => {
            feedback.alert({
              title: 'Delete failed',
              message: String(mutationError),
              buttons: [{ text: 'OK' }],
            });
          },
        });
      },
      connectLocal: async () => {
        setLocalSetupSaving(true);
        try {
          await localConnection.configure(localUrlInput.trim(), localKeyInput.trim());
          setLocalSetupVisible(false);
        } catch {
          // probe result is shown via connection mode; no extra alert needed
        } finally {
          setLocalSetupSaving(false);
        }
      },
    },
  };
}
