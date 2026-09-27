import { ImageManipulator } from 'expo-image-manipulator';
import type * as ImagePicker from 'expo-image-picker';
import type { User } from '@/types/User';

export type ImageLimits = User['imageLimits'];

// Re-encode quality for a photo that has to shrink to fit; visually lossless for photos.
const FIT_QUALITY = 0.9;

/**
 * Fits a picked photo to the account's upload caps, as `/users/me` reports them.
 *
 * A photo within the caps is returned untouched, so it uploads at full resolution. One over
 * them is scaled down just enough and re-encoded. The server enforces the same caps; this only
 * saves an upload it would reject. Returns null when the photo cannot be processed.
 */
export async function processImage(
  asset: Pick<ImagePicker.ImagePickerAsset, 'uri'> &
    Partial<Pick<ImagePicker.ImagePickerAsset, 'width' | 'height' | 'fileSize'>>,
  limits: ImageLimits,
): Promise<string | null> {
  const { uri, width, height, fileSize } = asset;
  const scale =
    width && height
      ? Math.min(
          1,
          Math.sqrt(limits.maxPixels / (width * height)),
          limits.maxSidePx / Math.max(width, height),
        )
      : 1;
  const overBytes = fileSize !== undefined && fileSize > limits.maxBytes;
  if (scale === 1 && !overBytes) return uri;

  try {
    const manipulator = ImageManipulator.manipulate(uri);
    if (width && height && scale < 1) {
      // Floor both sides so the result stays within the pixel cap after rounding.
      manipulator.resize({ width: Math.floor(width * scale), height: Math.floor(height * scale) });
    }
    const rendered = await manipulator.renderAsync();
    const saved = await rendered.saveAsync({ compress: FIT_QUALITY });
    return saved.uri;
  } catch {
    return null;
  }
}
