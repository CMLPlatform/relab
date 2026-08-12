import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  useCameraQuery,
  useDeleteCameraMutation,
  useUpdateCameraMutation,
} from '@/features/cameras/rpi/hooks';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createCameraDetailActions } from './detailActions';
import { useCameraDetailDialogs } from './detailState';
import { useEffectiveCameraConnection } from './useEffectiveCameraConnection';

export function useCameraDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useRequireAuth('/cameras');
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

  const effectiveConnection = useEffectiveCameraConnection(camera, id ?? '');
  const { localConnection } = effectiveConnection;
  const isOnline = effectiveConnection.relayStatus === 'online';
  const canPreview = effectiveConnection.isReachable;
  const { preview, dialogs, actions: dialogActions } = useCameraDetailDialogs(localConnection);

  useEffect(() => {
    navigation.setOptions({ title: camera?.name ?? 'Camera' });
  }, [camera?.name, navigation]);

  const actions = createCameraDetailActions({
    camera,
    refetch,
    router,
    feedback,
    localConnection,
    dialogs,
    dialogActions,
    updateMutation,
    deleteMutation,
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
    preview,
    dialogs: {
      ...dialogs,
      deleteLoading: deleteMutation.isPending,
    },
    actions: {
      ...dialogActions,
      ...actions,
    },
  };
}
