import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as auth from '../authentication';
import * as client from '../client';
import {
  buildCameraHlsUrl,
  captureImageFromCamera,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameras,
  fetchCameraTelemetry,
  updateCamera,
} from '../rpiCamera';

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

const mockGetToken = jest.mocked(auth.getToken);
const mockApiFetch = jest.mocked(client.apiFetch);

function mockJsonResponse(body: unknown, { ok = true, status = 200 } = {}) {
  mockApiFetch.mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as Response);
}

describe('rpiCamera API service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue('camera-token');
  });

  it('fetches cameras with optional status query and auth header', async () => {
    mockJsonResponse([{ id: 'cam-1', name: 'Desk Cam' }]);

    const result = await fetchCameras(true);

    expect(result).toEqual([{ id: 'cam-1', name: 'Desk Cam' }]);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/plugins/rpi-cam/cameras?include_status=true'),
      }),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer camera-token',
        }),
      }),
    );
  });

  it('fetches a single camera with include_status when requested', async () => {
    mockJsonResponse({ id: 'cam-1', name: 'Desk Cam' });

    const result = await fetchCamera('cam-1', true);

    expect(result).toEqual({ id: 'cam-1', name: 'Desk Cam' });
    expect(mockApiFetch).toHaveBeenCalledWith(
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
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-3'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('deletes a camera and returns void', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    await expect(deleteCamera('cam-4')).resolves.toBeUndefined();

    expect(mockApiFetch).toHaveBeenCalledWith(
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
    expect(mockApiFetch).toHaveBeenCalledWith(
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
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/pairing/claim'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('uses backend pairing error messages when available', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: { message: 'Pairing code expired' } }),
    } as Response);

    await expect(claimPairingCode({ code: 'EXPIRED', camera_name: 'Old Cam' })).rejects.toThrow(
      'Pairing code expired',
    );
  });

  it('falls back to status-based errors when pairing response has no message', async () => {
    mockApiFetch.mockResolvedValueOnce({
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

    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
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

  it('sets include_telemetry on the list endpoint when requested', async () => {
    mockJsonResponse([{ id: 'cam-1', telemetry: null, status: { connection: 'online' } }]);

    await fetchCameras(false, { includeTelemetry: true });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        // include_status comes along for free because include_telemetry implies it.
        href: expect.stringContaining('include_status=true'),
      }),
      expect.objectContaining({ method: 'GET' }),
    );
    const urlArg = mockApiFetch.mock.calls[0]?.[0] as URL;
    expect(urlArg.searchParams.get('include_telemetry')).toBe('true');
  });

  it('omits include_telemetry when the flag is false', async () => {
    mockJsonResponse([]);

    await fetchCameras(true);

    const urlArg = mockApiFetch.mock.calls[0]?.[0] as URL;
    expect(urlArg.searchParams.get('include_status')).toBe('true');
    expect(urlArg.searchParams.get('include_telemetry')).toBeNull();
  });

  it('fetches a camera telemetry snapshot with an auth header', async () => {
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
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/rpi-cam/cameras/cam-telemetry/telemetry'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer camera-token' }),
      }),
    );
  });

  it('throws a descriptive error when telemetry fetch fails', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await expect(fetchCameraTelemetry('cam-broken')).rejects.toThrow(
      'Failed to fetch camera telemetry (503)',
    );
  });
});
