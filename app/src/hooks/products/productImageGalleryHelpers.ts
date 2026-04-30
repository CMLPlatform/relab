import type * as ImagePicker from 'expo-image-picker';
import { resolveApiMediaUrl } from '@/services/api/media';
import { processImage } from '@/services/media/imageProcessing';

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

export async function buildImportedImages(assets: readonly ImagePicker.ImagePickerAsset[]) {
  return Promise.all(
    assets.map(async (asset) => {
      const processedUri = await processImage(asset);
      return { url: processedUri ?? asset.uri, description: '' };
    }),
  );
}

export function hasRpiCamerasConfigured(cameraCount: number | undefined) {
  return (cameraCount ?? 0) > 0;
}
