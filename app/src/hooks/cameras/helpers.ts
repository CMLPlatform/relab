import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import type { Router } from 'expo-router';
import { createElement, useEffect } from 'react';

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
  router: Pick<Router, 'replace'>;
  captureAllProductId: number | null;
  streamProductId: number | null;
  streamModeEnabled: boolean;
}) {
  const backProductId = captureAllProductId ?? streamProductId;

  navigation.setOptions({
    title: streamModeEnabled ? 'Select camera to stream' : 'My Cameras',
    headerLeft: (props: HeaderBackButtonProps) =>
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

export function useCamerasHeader(args: Parameters<typeof setCamerasHeaderOptions>[0]) {
  useEffect(() => {
    setCamerasHeaderOptions(args);
  }, [args]);
}
