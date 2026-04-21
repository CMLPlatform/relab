import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

export function useCameraRouteModes() {
  const { product: productParam, stream: streamParam } = useLocalSearchParams<{
    product?: string;
    stream?: string;
  }>();

  const captureAllProductId = useMemo(() => {
    if (!productParam) return null;
    const id = Number(Array.isArray(productParam) ? productParam[0] : productParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [productParam]);

  const streamProductId = useMemo(() => {
    if (!streamParam) return null;
    const id = Number(Array.isArray(streamParam) ? streamParam[0] : streamParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [streamParam]);

  return {
    captureAllProductId,
    captureModeEnabled: captureAllProductId !== null,
    streamProductId,
    streamModeEnabled: streamProductId !== null,
  };
}
