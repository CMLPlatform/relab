import { ImageManipulator } from 'expo-image-manipulator';
import type * as ImagePicker from 'expo-image-picker';
import type { User } from '@/types/User';

export type ImageLimits = User['imageLimits'];

/** The contributor tier's caps, for the moment before the signed-in account has loaded. */
export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 4096 * 3072,
};

// The server's per-side cap (MAX_IMAGE_DIMENSION), the same for every role.
const MAX_IMAGE_SIDE_PX = 10_000;
// Re-encode quality for a photo that has to change to fit; visually lossless for photos.
const FIT_QUALITY = 0.9;
// What the server accepts. Anything else (iOS HEIC, AVIF, TIFF) is re-encoded as JPEG.
const UPLOADABLE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'bmp']);
// Re-encodes before giving up on a photo still over the byte cap.
const MAX_FIT_ATTEMPTS = 3;

type PickedAsset = Pick<ImagePicker.ImagePickerAsset, 'uri'> &
  Partial<Pick<ImagePicker.ImagePickerAsset, 'width' | 'height' | 'fileSize' | 'mimeType'>>;

function isUploadableFormat({ uri, mimeType }: PickedAsset) {
  const format = mimeType?.split('/')[1] ?? uri.split('?')[0].split('.').pop();
  return UPLOADABLE_FORMATS.has(format?.toLowerCase() ?? '');
}

async function fileSize(uri: string): Promise<number | undefined> {
  try {
    return (await (await fetch(uri)).blob()).size;
  } catch {
    return undefined;
  }
}

/**
 * Fits a picked photo to the account's upload caps, as `/users/me` reports them.
 *
 * A photo within the caps, in a format the server accepts, is returned untouched, so it uploads
 * at full resolution. Otherwise it is scaled down just enough and re-encoded, then re-checked
 * against the byte cap. The server enforces the same caps; this only saves an upload it would
 * reject. Returns null when the photo cannot be made to fit.
 */
export async function processImage(
  asset: PickedAsset,
  limits: ImageLimits,
): Promise<string | null> {
  const { uri, width, height, fileSize: pickedSize } = asset;
  let scale =
    width && height
      ? Math.min(
          1,
          Math.sqrt(limits.maxPixels / (width * height)),
          MAX_IMAGE_SIDE_PX / Math.max(width, height),
        )
      : 1;
  const overBytes = pickedSize !== undefined && pickedSize > limits.maxBytes;
  if (scale === 1 && !overBytes && isUploadableFormat(asset)) return uri;

  try {
    for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt++) {
      const manipulator = ImageManipulator.manipulate(uri);
      if (width && height && scale < 1) {
        // Floor both sides so the result stays within the pixel cap after rounding.
        manipulator.resize({
          width: Math.floor(width * scale),
          height: Math.floor(height * scale),
        });
      }
      // biome-ignore lint/performance/noAwaitInLoops: each attempt's scale depends on the previous attempt's size.
      const rendered = await manipulator.renderAsync();
      const saved = await rendered.saveAsync({ compress: FIT_QUALITY });
      const size = await fileSize(saved.uri);
      if (size === undefined || size <= limits.maxBytes) return saved.uri;
      if (!width || !height) return null;
      // JPEG size scales roughly with pixel count; aim a little under the cap.
      scale *= Math.sqrt(limits.maxBytes / size) * 0.95;
    }
    return null;
  } catch {
    return null;
  }
}
