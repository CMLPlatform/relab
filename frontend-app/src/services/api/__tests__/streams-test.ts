import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchWithAuth } from '@/services/api/authentication';
import {
  buildCameraHlsUrl,
  getStreamStatus,
  startYouTubeStream,
  stopYouTubeStream,
} from '@/services/api/rpiCamera/streams';

jest.mock('@/services/api/authentication', () => ({
  fetchWithAuth: jest.fn(),
}));

const mockFetchWithAuth = jest.mocked(fetchWithAuth);

function mockResponse({
  ok = true,
  status = 200,
  json = async () => ({}),
}: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}) {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok,
    status,
    json,
  } as Response);
}

describe('rpiCamera streams service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the relay HLS playlist URL for a camera preview', () => {
    expect(buildCameraHlsUrl('cam-live')).toContain(
      '/plugins/rpi-cam/cameras/cam-live/hls/cam-preview/index.m3u8',
    );
  });

  it('starts a YouTube stream and returns the stream payload', async () => {
    const payload = {
      url: 'https://youtube.example/live',
      started_at: '2026-04-21T10:00:00Z',
    };
    mockResponse({ json: async () => payload });

    await expect(
      startYouTubeStream('cam-1', {
        product_id: 42,
        title: 'Workbench Demo',
        privacy_status: 'unlisted',
      }),
    ).resolves.toEqual(payload);

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-1/stream/record/start'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          product_id: 42,
          title: 'Workbench Demo',
          privacy_status: 'unlisted',
        }),
      }),
    );
  });

  it('maps stream-start auth and conflict errors to app-level errors', async () => {
    mockResponse({ ok: false, status: 403 });
    await expect(startYouTubeStream('cam-1', { product_id: 1 })).rejects.toThrow(
      'GOOGLE_OAUTH_REQUIRED',
    );

    mockResponse({ ok: false, status: 409 });
    await expect(startYouTubeStream('cam-1', { product_id: 1 })).rejects.toThrow(
      'STREAM_ALREADY_ACTIVE',
    );

    mockResponse({ ok: false, status: 500 });
    await expect(startYouTubeStream('cam-1', { product_id: 1 })).rejects.toThrow(
      'Failed to start stream (500)',
    );
  });

  it('treats 204 as a successful stream stop and throws on other failures', async () => {
    mockResponse({ ok: true, status: 204 });
    await expect(stopYouTubeStream('cam-2')).resolves.toBeUndefined();

    mockResponse({ ok: false, status: 503 });
    await expect(stopYouTubeStream('cam-2')).rejects.toThrow('Failed to stop stream (503)');
  });

  it('returns null for missing stream status and throws for other failures', async () => {
    mockResponse({ ok: false, status: 404 });
    await expect(getStreamStatus('cam-3')).resolves.toBeNull();

    mockResponse({ ok: false, status: 502 });
    await expect(getStreamStatus('cam-3')).rejects.toThrow('Failed to fetch stream status (502)');
  });

  it('returns the current stream status payload when present', async () => {
    const payload = {
      url: 'https://youtube.example/live',
      started_at: '2026-04-21T11:00:00Z',
    };
    mockResponse({ json: async () => payload });

    await expect(getStreamStatus('cam-4')).resolves.toEqual(payload);

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-4/stream/status'),
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    );
  });
});
