import type * as ImagePicker from 'expo-image-picker';
import { resolveApiMediaUrl } from '@/services/api/media';
import { type ImageLimits, processImage } from '@/services/imageProcessing';

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
 * Turns picked assets into image entries, each fitted to the account's upload caps. A photo that
 * cannot be made to fit is dropped and reported, rather than failing later at save.
 */
export async function buildImportedImages(
  assets: readonly ImagePicker.ImagePickerAsset[],
  limits: ImageLimits,
  onReject?: (message: string) => void,
) {
  const urls = await Promise.all(assets.map((asset) => processImage(asset, limits)));
  const rejected = urls.filter((url) => url === null).length;
  if (rejected > 0) {
    onReject?.(
      rejected === 1
        ? "Couldn't prepare that photo for upload. Try another one."
        : `Couldn't prepare ${rejected} photos for upload. Try other ones.`,
    );
  }
  return urls.flatMap((url) => (url === null ? [] : [{ url, description: '' }]));
}

export function hasRpiCamerasConfigured(cameraCount: number | undefined) {
  return (cameraCount ?? 0) > 0;
}
