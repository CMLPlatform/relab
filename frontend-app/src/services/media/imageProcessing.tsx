import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  compressionQuality?: number;
  maxImageSizeMB?: number;
  onError?: (error: ImageProcessingError) => void;
}

export interface ImageProcessingError {
  type: 'size' | 'processing';
  message: string;
  fileSizeMB?: number;
}

const DEFAULT_OPTIONS: Required<Omit<ImageProcessingOptions, 'onError'>> = {
  maxWidth: 1920,
  maxHeight: 1920,
  compressionQuality: 0.8,
  maxImageSizeMB: 10,
};

export async function processImage(
  asset: ImagePicker.ImagePickerAsset | { uri: string; width?: number; height?: number },
  options: ImageProcessingOptions = {},
): Promise<string | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxImageSizeBytes = opts.maxImageSizeMB * 1024 * 1024;

  try {
    console.log('Processing image:', asset.uri);

    const { width, height, uri } = asset;
    const fileSize = 'fileSize' in asset ? asset.fileSize : undefined;

    if (width && height) {
      console.log('Original dimensions:', width, 'x', height);
    }

    // Validate file size
    if (fileSize !== undefined && fileSize > maxImageSizeBytes) {
      const mb = (fileSize / (1024 * 1024)).toFixed(2);
      const error: ImageProcessingError = {
        type: 'size',
        message: `Max size is ${opts.maxImageSizeMB} MB. Selected image size: ${mb} MB.`,
        fileSizeMB: parseFloat(mb),
      };
      options.onError?.(error);
      return null;
    }

    // Check if resizing is needed
    const needsResize = width && height && (width > opts.maxWidth || height > opts.maxHeight);

    const manipulator = ImageManipulator.manipulate(uri);

    if (needsResize) {
      let newWidth: number | undefined;
      let newHeight: number | undefined;

      if (width > height) {
        newWidth = Math.min(width, opts.maxWidth);
      } else {
        newHeight = Math.min(height, opts.maxHeight);
      }

      if (newWidth) {
        manipulator.resize({ width: newWidth });
      } else if (newHeight) {
        manipulator.resize({ height: newHeight });
      }

      console.log('Resizing to:', newWidth || 'auto', 'x', newHeight || 'auto');
    }

    const rendered = await manipulator.renderAsync();
    const compressed = await rendered.saveAsync({ compress: opts.compressionQuality });

    console.log('Image processed. New URI:', compressed.uri);
    return compressed.uri;
  } catch (error) {
    console.error('Error processing image:', error);
    const processingError: ImageProcessingError = {
      type: 'processing',
      message: 'Failed to process image',
    };
    options.onError?.(processingError);
    return null;
  }
}
