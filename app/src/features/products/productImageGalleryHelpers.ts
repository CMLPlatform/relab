import type * as ImagePicker from 'expo-image-picker';
import { resolveApiMediaUrl } from '@/services/api/media';
import { processImage } from '@/services/imageProcessing';

export function appendCapturedImage(
  images: { url: string; description: string; id?: string }[],
  captured: {
    id: string;
    url: string;
    thumbnailUrl?: string | null;
    description: string;
  },
) {
  return [
    ...images,
    {
      id: captured.id,
      url: resolveApiMediaUrl(captured.url) ?? captured.url,
      thumbnailUrl: captured.thumbnailUrl
        ? (resolveApiMediaUrl(captured.thumbnailUrl) ?? captured.thumbnailUrl)
        : undefined,
      description: captured.description,
    },
  ];
}

/**
 * Processes picked assets into image entries, dropping any the processor
 * rejects for size. Falling back to the raw asset there would only defer the
 * failure to save time, where it surfaces as an opaque 413.
 */
export async function buildImportedImages(
  assets: readonly ImagePicker.ImagePickerAsset[],
  onReject?: (message: string) => void,
) {
  const results = await Promise.all(
    assets.map(async (asset) => {
      let tooLarge = false;
      const processedUri = await processImage(asset, {
        onError: (error) => {
          if (error.type !== 'size') return;
          tooLarge = true;
          onReject?.(error.message);
        },
      });
      return tooLarge ? [] : [{ url: processedUri ?? asset.uri, description: '' }];
    }),
  );
  return results.flat();
}

export function hasRpiCamerasConfigured(cameraCount: number | undefined) {
  return (cameraCount ?? 0) > 0;
}
