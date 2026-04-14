import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as auth from '../authentication';
import * as client from '../client';
import {
  type CameraSnapshotError,
  captureImageFromCamera,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameras,
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

  it('creates an object URL for snapshots', async () => {
    const blob = new Blob(['snapshot'], { type: 'image/jpeg' });
    const createObjectUrlSpy = jest
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:camera-snapshot');

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as Response);

    const result = await fetchCameraSnapshot('cam-7');

    expect(result).toBe('blob:camera-snapshot');
    expect(createObjectUrlSpy).toHaveBeenCalledWith(blob);
    createObjectUrlSpy.mockRestore();
  });

  it('throws a CameraSnapshotError with a clear message when preview conflicts with streaming', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 409 } as Response);

    await expect(fetchCameraSnapshot('cam-8')).rejects.toMatchObject({
      name: 'CameraSnapshotError',
      status: 409,
      message: 'Snapshot preview unavailable while the camera is streaming.',
    });
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

    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 504 } as Response);
    await expect(fetchCameraSnapshot('cam-9')).rejects.toThrow('Failed to fetch snapshot (504)');
  });
});
