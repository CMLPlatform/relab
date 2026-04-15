import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  CameraConnectionCard,
  CameraDangerZone,
  CameraDetailDialogs,
  CameraDetailErrorState,
  CameraDetailLayout,
  CameraDetailLoadingState,
  CameraDetailsCard,
  CameraPreviewSection,
  CameraStreamingSection,
} from '@/components/cameras/CameraDetailSections';
import { useAuth } from '@/context/AuthProvider';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useEffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import {
  useCameraQuery,
  useDeleteCameraMutation,
  useUpdateCameraMutation,
} from '@/hooks/useRpiCameras';

export default function CameraDetailScreen() {
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
  }, [user, router]);

  useEffect(() => {
    navigation.setOptions({ title: camera?.name ?? 'Camera' });
  }, [navigation, camera?.name]);

  if (!user) return null;
  if (isLoading) return <CameraDetailLoadingState />;

  if (isError || !camera) {
    return (
      <CameraDetailErrorState
        message={String(error) || 'Camera not found.'}
        onRetry={() => refetch()}
      />
    );
  }

  const handleSaveName = (name: string) => {
    updateMutation.mutate(
      { name },
      {
        onSuccess: () => setEditNameVisible(false),
        onError: (err) =>
          feedback.alert({
            title: 'Save failed',
            message: String(err),
            buttons: [{ text: 'OK' }],
          }),
      },
    );
  };

  const handleSaveDescription = (description: string) => {
    updateMutation.mutate(
      { description: description || null },
      {
        onSuccess: () => setEditDescriptionVisible(false),
        onError: (err) =>
          feedback.alert({
            title: 'Save failed',
            message: String(err),
            buttons: [{ text: 'OK' }],
          }),
      },
    );
  };

  const handleDelete = () => {
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
  };

  const handleConnectLocal = async () => {
    setLocalSetupSaving(true);
    try {
      await localConnection.configure(localUrlInput.trim(), localKeyInput.trim());
      setLocalSetupVisible(false);
    } catch {
      // probe result is shown via connection mode; no extra alert needed
    } finally {
      setLocalSetupSaving(false);
    }
  };

  return (
    <>
      <CameraDetailLayout>
        <CameraConnectionCard
          camera={camera}
          effectiveConnection={effectiveConnection}
          isFetching={isFetching}
          onRefresh={() => refetch()}
          onOpenManualSetup={() => {
            setLocalUrlInput(localConnection.localBaseUrl ?? '');
            setLocalKeyInput('');
            setLocalSetupVisible(true);
          }}
          onDisconnectLocal={() => void localConnection.clearLocalConnection()}
        />

        <CameraPreviewSection
          camera={camera}
          canPreview={canPreview}
          previewEnabled={previewEnabled}
          onTogglePreview={() => setPreviewEnabled((enabled) => !enabled)}
          connectionInfo={localConnection}
        />

        <CameraStreamingSection cameraId={camera.id} isOnline={isOnline} />

        <CameraDetailsCard
          camera={camera}
          onEditName={() => setEditNameVisible(true)}
          onEditDescription={() => setEditDescriptionVisible(true)}
        />

        <CameraDangerZone onDelete={() => setDeleteVisible(true)} />
      </CameraDetailLayout>

      <CameraDetailDialogs
        camera={camera}
        editNameVisible={editNameVisible}
        editDescriptionVisible={editDescriptionVisible}
        deleteVisible={deleteVisible}
        localSetupVisible={localSetupVisible}
        localUrlInput={localUrlInput}
        localKeyInput={localKeyInput}
        updateLoading={updateMutation.isPending}
        deleteLoading={deleteMutation.isPending}
        localSetupSaving={localSetupSaving}
        onDismissEditName={() => setEditNameVisible(false)}
        onDismissEditDescription={() => setEditDescriptionVisible(false)}
        onDismissDelete={() => setDeleteVisible(false)}
        onDismissLocalSetup={() => setLocalSetupVisible(false)}
        onSaveName={handleSaveName}
        onSaveDescription={handleSaveDescription}
        onDeleteCamera={handleDelete}
        onChangeLocalUrl={setLocalUrlInput}
        onChangeLocalKey={setLocalKeyInput}
        onConnectLocal={() => {
          void handleConnectLocal();
        }}
      />
    </>
  );
}
