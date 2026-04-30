import { describe, expect, it, jest } from '@jest/globals';
import { resolveCameraLivePreview } from '@/hooks/camera-data/previews';

jest.mock('@/services/api/rpiCamera', () => ({
  __esModule: true,
  buildCameraHlsUrl: jest.fn(
    (cameraId: string) => `/api/rpi-cameras/${cameraId}/hls/cam-preview/index.m3u8`,
  ),
  buildLocalHlsUrl: jest.fn(
    (baseUrl: string) => `${baseUrl.replace(':8018', ':8888')}/cam-preview/index.m3u8`,
  ),
}));

describe('rpi camera preview helpers', () => {
  it('returns a null preview when disabled or when no camera id is present', () => {
    expect(resolveCameraLivePreview(null)).toEqual({
      hlsUrl: null,
      isLocalStream: false,
    });

    expect(resolveCameraLivePreview('cam-1', { enabled: false })).toEqual({
      hlsUrl: null,
      isLocalStream: false,
    });
  });

  it('returns a direct-local preview URL when local connection info is available', () => {
    expect(
      resolveCameraLivePreview('cam-1', {
        connectionInfo: {
          mode: 'local',
          localBaseUrl: 'http://192.168.7.1:8018',
          localMediaUrl: 'http://192.168.7.1:8888',
          localApiKey: 'local-key',
        },
      }),
    ).toEqual({
      hlsUrl: 'http://192.168.7.1:8888/cam-preview/index.m3u8',
      isLocalStream: true,
    });
  });

  it('returns the relay HLS URL when no direct connection is available', () => {
    expect(resolveCameraLivePreview('cam-99')).toEqual({
      hlsUrl: '/api/rpi-cameras/cam-99/hls/cam-preview/index.m3u8',
      isLocalStream: false,
    });
  });
});
