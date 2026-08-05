import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type * as ImagePicker from 'expo-image-picker';
import {
  appendCapturedImage,
  buildImportedImages,
  hasRpiCamerasConfigured,
} from '@/features/products/productImageGalleryHelpers';

const mockProcessImage: jest.Mock = jest.fn();

jest.mock('@/services/imageProcessing', () => ({
  processImage: (...args: unknown[]) => mockProcessImage(...args),
}));

describe('productImageGalleryHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects whether RPi cameras are configured', () => {
    expect(hasRpiCamerasConfigured(undefined)).toBe(false);
    expect(hasRpiCamerasConfigured(0)).toBe(false);
    expect(hasRpiCamerasConfigured(2)).toBe(true);
  });

  it('appends captured media with normalized API URLs', () => {
    const result = appendCapturedImage([{ url: 'local.jpg', description: '' }], {
      id: 'capture-1',
      url: '/api/media/capture.jpg',
      thumbnailUrl: '/api/media/capture-thumb.jpg',
      description: 'Captured frame',
    });

    expect(result).toEqual([
      { url: 'local.jpg', description: '' },
      expect.objectContaining({
        id: 'capture-1',
        description: 'Captured frame',
      }),
    ]);
  });

  it('builds imported images from processed picker assets', async () => {
    mockProcessImage.mockImplementationOnce(async () => 'processed://image-1');
    mockProcessImage.mockImplementationOnce(async () => null);

    const assets = [
      { uri: 'file://one.jpg' },
      { uri: 'file://two.jpg' },
    ] as ImagePicker.ImagePickerAsset[];

    await expect(buildImportedImages(assets)).resolves.toEqual([
      { url: 'processed://image-1', description: '' },
      { url: 'file://two.jpg', description: '' },
    ]);
  });

  // Keeping the raw asset after a size rejection only defers the failure to
  // save time, where the server answers with an opaque 413.
  it('drops an oversized pick and reports it instead of falling back to the raw asset', async () => {
    mockProcessImage.mockImplementation(async (_asset: unknown, options: unknown) => {
      (options as { onError: (e: unknown) => void }).onError({
        type: 'size',
        message: 'Max size is 10 MB. Selected image size: 24.00 MB.',
      });
      return null;
    });
    const onReject = jest.fn();

    const assets = [{ uri: 'file://huge.jpg' }] as ImagePicker.ImagePickerAsset[];

    await expect(buildImportedImages(assets, onReject)).resolves.toEqual([]);
    expect(onReject).toHaveBeenCalledWith('Max size is 10 MB. Selected image size: 24.00 MB.');
  });
});
