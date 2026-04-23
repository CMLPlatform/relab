import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type * as ImagePicker from 'expo-image-picker';
import {
  appendCapturedImage,
  buildImportedImages,
  hasRpiCamerasConfigured,
} from '@/hooks/products/productImageGalleryHelpers';

const mockProcessImage: jest.Mock = jest.fn();

jest.mock('@/services/media/imageProcessing', () => ({
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
});
