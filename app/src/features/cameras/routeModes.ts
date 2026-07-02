import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

function parsePositiveIntParam(param: string | string[] | undefined): number | null {
  if (!param) return null;
  const id = Number(Array.isArray(param) ? param[0] : param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useCameraRouteModes() {
  const { product: productParam, stream: streamParam } = useLocalSearchParams<{
    product?: string;
    stream?: string;
  }>();

  const captureAllProductId = useMemo(() => parsePositiveIntParam(productParam), [productParam]);
  const streamProductId = useMemo(() => parsePositiveIntParam(streamParam), [streamParam]);

  return {
    captureAllProductId,
    captureModeEnabled: captureAllProductId !== null,
    streamProductId,
    streamModeEnabled: streamProductId !== null,
  };
}
