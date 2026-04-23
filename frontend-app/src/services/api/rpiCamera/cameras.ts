import { fetchWithAuth } from '@/services/api/authentication';
import type { CameraRead, CameraReadWithStatus, CameraTelemetry, CameraUpdate } from './shared';
import { CAMERA_BASE, normalizeCameraReadWithStatus, throwFromResponse } from './shared';

export async function fetchCameras(
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
): Promise<CameraReadWithStatus[]> {
  const url = new URL(CAMERA_BASE);
  if (includeStatus || includeTelemetry) url.searchParams.set('include_status', 'true');
  if (includeTelemetry) url.searchParams.set('include_telemetry', 'true');
  const resp = await fetchWithAuth(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to fetch cameras');
  const data = (await resp.json()) as CameraReadWithStatus[];
  return data.map((camera) => normalizeCameraReadWithStatus(camera));
}

export async function fetchCamera(
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
): Promise<CameraReadWithStatus> {
  const url = new URL(`${CAMERA_BASE}/${id}`);
  if (includeStatus || includeTelemetry) url.searchParams.set('include_status', 'true');
  if (includeTelemetry) url.searchParams.set('include_telemetry', 'true');
  const resp = await fetchWithAuth(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to fetch camera');
  const data = (await resp.json()) as CameraReadWithStatus;
  return normalizeCameraReadWithStatus(data);
}

export async function fetchCameraTelemetry(cameraId: string): Promise<CameraTelemetry> {
  const resp = await fetchWithAuth(`${CAMERA_BASE}/${cameraId}/telemetry`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to fetch camera telemetry');
  return resp.json() as Promise<CameraTelemetry>;
}

export async function updateCamera(id: string, data: CameraUpdate): Promise<CameraRead> {
  const resp = await fetchWithAuth(`${CAMERA_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to update camera');
  return resp.json() as Promise<CameraRead>;
}

export async function deleteCamera(id: string): Promise<void> {
  const resp = await fetchWithAuth(`${CAMERA_BASE}/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to delete camera');
}
