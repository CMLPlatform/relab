import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as auth from '../authentication';
import {
  buildCameraHlsUrl,
  buildLocalHlsUrl,
  captureImageFromCamera,
  captureImageLocally,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameraSnapshotLocally,
  fetchCameras,
  fetchCameraTelemetry,
  fetchLocalAccessInfo,
  updateCamera,
} from '../rpiCamera';

jest.mock('@/services/api/authentication', () => ({
  fetchWithAuth: jest.fn(),
}));

const mockFetchWithAuth = jest.mocked(auth.fetchWithAuth);

function mockJsonResponse(body: unknown, { ok = true, status = 200 } = {}) {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as Response);
}

function mockImageResponse(bytes: Uint8Array, contentType = 'image/jpeg') {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as Response);
}

describe('rpiCamera API service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches cameras with optional status query via the shared auth fetcher', async () => {
    mockJsonResponse([{ id: 'cam-1', name: 'Desk Cam' }]);

    const result = await fetchCameras(true);

    expect(result).toEqual([
      { id: 'cam-1', name: 'Desk Cam', last_image_url: null, last_image_thumbnail_url: null },
    ]);
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/plugins/rpi-cam/cameras?include_status=true'),
      }),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('fetches a single camera with include_status when requested', async () => {
    mockJsonResponse({ id: 'cam-1', name: 'Desk Cam' });

    const result = await fetchCamera('cam-1', true);

    expect(result).toEqual({
      id: 'cam-1',
      name: 'Desk Cam',
      last_image_url: null,
      last_image_thumbnail_url: null,
    });
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/plugins/rpi-cam/cameras/cam-1?include_status=true'),
      }),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('updates a camera with a PATCH request', async () => {
    const payload = { name: 'Renamed Cam' };
    mockJsonResponse({ id: 'cam-3', name: 'Renamed Cam' });

    const result = await updateCamera('cam-3', payload);

    expect(result).toEqual({ id: 'cam-3', name: 'Renamed Cam' });
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-3'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('deletes a camera and returns void', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    await expect(deleteCamera('cam-4')).resolves.toBeUndefined();

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-4'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('maps captured image fields from snake_case response', async () => {
    mockJsonResponse({
      id: 7,
      image_url: 'https://cdn.example.com/capture.jpg',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg',
      description: 'Fresh capture',
    });

    const result = await captureImageFromCamera('cam-6', 42);

    expect(result).toEqual({
      id: '7',
      url: 'https://cdn.example.com/capture.jpg',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      description: 'Fresh capture',
    });
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-6/image'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ product_id: 42 }),
      }),
    );
  });

  it('returns claimPairingCode data on success', async () => {
    const payload = { code: 'PAIR123', camera_name: 'Workbench Cam' };
    mockJsonResponse({ id: 'cam-8', api_key: 'pair-secret' });

    const result = await claimPairingCode(payload);

    expect(result).toEqual({ id: 'cam-8', api_key: 'pair-secret' });
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/pairing/claim'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('uses backend pairing error messages when available', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: { message: 'Pairing code expired' } }),
    } as Response);

    await expect(claimPairingCode({ code: 'EXPIRED', camera_name: 'Old Cam' })).rejects.toThrow(
      'Pairing code expired',
    );
  });

  it('falls back to status-based errors when pairing response has no message', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(claimPairingCode({ code: 'BROKEN', camera_name: 'Broken Cam' })).rejects.toThrow(
      'Pairing failed (500)',
    );
  });

  it('throws descriptive errors for failed camera requests', async () => {
    mockJsonResponse({}, { ok: false, status: 503 });
    await expect(fetchCameras()).rejects.toThrow('Failed to fetch cameras (503)');

    mockJsonResponse({}, { ok: false, status: 404 });
    await expect(fetchCamera('missing')).rejects.toThrow('Failed to fetch camera (404)');

    mockJsonResponse({}, { ok: false, status: 400 });
    await expect(updateCamera('cam-9', { name: 'Bad' })).rejects.toThrow(
      'Failed to update camera (400)',
    );

    mockFetchWithAuth.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    await expect(deleteCamera('cam-9')).rejects.toThrow('Failed to delete camera (401)');

    mockJsonResponse({}, { ok: false, status: 502 });
    await expect(captureImageFromCamera('cam-9', 42)).rejects.toThrow(
      'Failed to capture image (502)',
    );
  });

  it('builds the LL-HLS playlist URL for a camera id', () => {
    const url = buildCameraHlsUrl('cam-live');
    expect(url).toContain('/plugins/rpi-cam/cameras/cam-live/hls/cam-preview/index.m3u8');
  });

  it('builds the local LL-HLS playlist URL through the Pi FastAPI proxy', () => {
    expect(buildLocalHlsUrl('http://192.168.1.20:8018/')).toBe(
      'http://192.168.1.20:8018/preview/hls/cam-preview/index.m3u8',
    );
  });

  it('sets include_telemetry on the list endpoint when requested', async () => {
    mockJsonResponse([{ id: 'cam-1', telemetry: null, status: { connection: 'online' } }]);

    await fetchCameras(false, { includeTelemetry: true });

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        // include_status comes along for free because include_telemetry implies it.
        href: expect.stringContaining('include_status=true'),
      }),
      expect.objectContaining({ method: 'GET' }),
    );
    const urlArg = mockFetchWithAuth.mock.calls[0]?.[0] as URL;
    expect(urlArg.searchParams.get('include_telemetry')).toBe('true');
  });

  it('omits include_telemetry when the flag is false', async () => {
    mockJsonResponse([]);

    await fetchCameras(true);

    const urlArg = mockFetchWithAuth.mock.calls[0]?.[0] as URL;
    expect(urlArg.searchParams.get('include_status')).toBe('true');
    expect(urlArg.searchParams.get('include_telemetry')).toBeNull();
  });

  it('returns local access info when the backend payload is well shaped', async () => {
    mockJsonResponse({
      local_api_key: 'LOCAL_123',
      candidate_urls: ['http://192.168.1.20:8018'],
      mdns_name: 'pi.local',
    });

    await expect(fetchLocalAccessInfo('cam-1')).resolves.toEqual({
      local_api_key: 'LOCAL_123',
      candidate_urls: ['http://192.168.1.20:8018'],
      mdns_name: 'pi.local',
    });
  });

  it('returns null when the backend local access payload is malformed', async () => {
    mockJsonResponse({ local_api_key: 'LOCAL_123', candidate_urls: 'oops', mdns_name: null });

    await expect(fetchLocalAccessInfo('cam-1')).resolves.toBeNull();
  });

  it('fetches a camera telemetry snapshot via the shared auth fetcher', async () => {
    const payload = {
      timestamp: '2026-04-14T12:00:00Z',
      cpu_temp_c: 55.5,
      cpu_percent: 12.0,
      mem_percent: 40.0,
      disk_percent: 25.0,
      preview_fps: null,
      preview_sessions: 1,
      thermal_state: 'normal' as const,
      current_preview_size: null,
    };
    mockJsonResponse(payload);

    const result = await fetchCameraTelemetry('cam-telemetry');

    expect(result).toEqual(payload);
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-telemetry/telemetry'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('fetches a camera snapshot as a data URI via the shared auth fetcher', async () => {
    mockImageResponse(new TextEncoder().encode('preview'));

    const result = await fetchCameraSnapshot('cam-snapshot');

    expect(result).toBe('data:image/jpeg;base64,cHJldmlldw==');
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-snapshot/snapshot'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Accept: 'image/jpeg' }),
      }),
    );
  });

  it('fetches a local camera snapshot directly from the Pi', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null),
      },
      arrayBuffer: async () => new TextEncoder().encode('local-preview').buffer,
    } as Response);

    const result = await fetchCameraSnapshotLocally('http://192.168.7.1:8018/', 'local-key');

    expect(result).toBe('data:image/jpeg;base64,bG9jYWwtcHJldmlldw==');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.7.1:8018/preview/snapshot',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'image/jpeg',
          'X-API-Key': 'local-key',
          'X-Request-ID': expect.any(String),
        }),
      }),
    );

    fetchSpy.mockRestore();
  });

  it('resolves relative last-image URLs against the API base', async () => {
    mockJsonResponse([
      {
        id: 'cam-1',
        name: 'Bench Cam',
        last_image_url: '/uploads/cameras/cam-1/latest.jpg',
        last_image_thumbnail_url: '/images/cam-1-thumb/resized?width=200',
      },
    ]);

    const result = await fetchCameras(true);

    expect(result[0]?.last_image_url).toBe(
      'http://localhost:8000/api/uploads/cameras/cam-1/latest.jpg',
    );
    expect(result[0]?.last_image_thumbnail_url).toBe(
      'http://localhost:8000/api/images/cam-1-thumb/resized?width=200',
    );
  });

  it('throws a descriptive error when telemetry fetch fails', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await expect(fetchCameraTelemetry('cam-broken')).rejects.toThrow(
      'Failed to fetch camera telemetry (503)',
    );
  });

  it('captures a local image with a request id header', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        image_id: 'img-1',
        image_url: 'https://cdn.example/image.jpg',
        thumbnail_url: null,
        description: 'test image',
      }),
    } as Response);

    const result = await captureImageLocally('http://192.168.7.1:8018/', 'local-key', 42);

    expect(result).toEqual({
      id: 'img-1',
      url: 'https://cdn.example/image.jpg',
      thumbnailUrl: null,
      description: 'test image',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.7.1:8018/captures',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': 'local-key',
          'X-Request-ID': expect.any(String),
        }),
      }),
    );

    fetchSpy.mockRestore();
  });
});
