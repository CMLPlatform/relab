import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { QueryClient } from '@tanstack/react-query';
import {
  captureFromMultipleCameras,
  clearOptimisticStreamStatus,
  resolveCaptureImageRequest,
  restoreOptimisticStreamStatus,
} from '@/hooks/camera-data/mutations';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import { captureImageFromCamera, captureImageLocally } from '@/services/api/rpiCamera';

jest.mock('@/services/api/rpiCamera', () => ({
  __esModule: true,
  captureImageFromCamera: jest.fn(async (cameraId: string, productId: number) => ({
    id: `${cameraId}-${productId}`,
    url: `https://example.com/${cameraId}-${productId}.jpg`,
    thumbnailUrl: null,
    description: '',
  })),
  captureImageLocally: jest.fn(async (baseUrl: string, apiKey: string, productId: number) => ({
    id: `${baseUrl}-${apiKey}-${productId}`,
    url: `https://example.com/${productId}.jpg`,
    thumbnailUrl: null,
    description: '',
  })),
}));

const localConnectionInfo: CameraConnectionInfo = {
  mode: 'local',
  localBaseUrl: 'http://192.168.7.1:8018',
  localMediaUrl: 'http://192.168.7.1:8888',
  localApiKey: 'local-key',
};

describe('rpi camera mutation helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes single-image capture through the local path when direct connection info is available', async () => {
    await resolveCaptureImageRequest({ cameraId: 'cam-1', productId: 42 }, localConnectionInfo);

    expect(captureImageLocally).toHaveBeenCalledWith('http://192.168.7.1:8018', 'local-key', 42);
    expect(captureImageFromCamera).not.toHaveBeenCalled();
  });

  it('falls back to relay capture when no local connection is available', async () => {
    await resolveCaptureImageRequest({ cameraId: 'cam-2', productId: 51 });

    expect(captureImageFromCamera).toHaveBeenCalledWith('cam-2', 51);
  });

  it('captures from multiple cameras and returns a success/error summary', async () => {
    jest
      .mocked(captureImageFromCamera)
      .mockImplementationOnce(async () => ({
        id: 'cam-1-5',
        url: 'https://example.com/cam-1-5.jpg',
        thumbnailUrl: null,
        description: '',
      }))
      .mockImplementationOnce(async () => {
        throw new Error('offline');
      });

    const result = await captureFromMultipleCameras({
      cameraIds: ['cam-1', 'cam-2'],
      productId: 5,
    });

    expect(result).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
      errors: [{ cameraId: 'cam-2', error: expect.any(Error) }],
    });
  });

  it('supports optimistic stream status clearing and restore', async () => {
    const cancelQueries = jest.fn(async () => undefined);
    const getQueryData = jest.fn(() => ({ id: 'stream-1' }));
    const setQueryData = jest.fn();
    const queryClient = {
      cancelQueries,
      getQueryData,
      setQueryData,
    } as unknown as QueryClient;

    const context = await clearOptimisticStreamStatus(queryClient, 'cam-9');

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['rpiCameraStreamStatus', 'cam-9'] });
    expect(setQueryData).toHaveBeenCalledWith(['rpiCameraStreamStatus', 'cam-9'], null);
    expect(context).toEqual({ previous: { id: 'stream-1' } });

    restoreOptimisticStreamStatus(queryClient, 'cam-9', context.previous);

    expect(setQueryData).toHaveBeenCalledWith(['rpiCameraStreamStatus', 'cam-9'], {
      id: 'stream-1',
    });
  });
});
