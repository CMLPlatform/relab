import type { ImperativeRouter, NativeStackHeaderBackProps } from 'expo-router';
import { createElement } from 'react';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';

const DESKTOP_COLUMNS = 3;
const MOBILE_COLUMNS = 2;

export function useCameraScreenData<T extends { id: string }>({
  cameras,
  isDesktop,
  isCameraReachable,
  captureModeEnabled,
  streamModeEnabled,
}: {
  cameras: T[] | undefined;
  isDesktop: boolean;
  isCameraReachable: (camera: T) => boolean;
  captureModeEnabled: boolean;
  streamModeEnabled: boolean;
}) {
  const rows = cameras ?? [];
  const onlineCameras = rows.filter(isCameraReachable);

  return {
    rows,
    onlineCameras,
    onlineCount: onlineCameras.length,
    numColumns: getCameraGridColumns(isDesktop),
    captureModeEnabled,
    streamModeEnabled,
  };
}

export function getCameraGridColumns(isDesktop: boolean) {
  return isDesktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS;
}

export function setCamerasHeaderOptions({
  navigation,
  router,
  captureAllProductId,
  streamProductId,
  streamModeEnabled,
}: {
  navigation: { setOptions: (options: object) => void };
  router: Pick<ImperativeRouter, 'replace'>;
  captureAllProductId: number | null;
  streamProductId: number | null;
  streamModeEnabled: boolean;
}) {
  const backProductId = captureAllProductId ?? streamProductId;

  navigation.setOptions({
    title: streamModeEnabled ? 'Select camera to stream' : 'My Cameras',
    headerLeft: (props: NativeStackHeaderBackProps) =>
      createElement(HeaderBackButton, {
        ...props,
        onPress: () => {
          if (backProductId) {
            router.replace({
              pathname: '/products/[id]',
              params: { id: backProductId.toString() },
            });
          } else {
            router.replace('/products');
          }
        },
      }),
  });
}
