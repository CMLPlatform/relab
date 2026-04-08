import { API_URL } from '@/config';
import { getToken } from '@/services/api/authentication';
import { apiFetch } from '@/services/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionMode = 'http' | 'websocket';
export type CameraConnectionStatus = 'online' | 'offline' | 'unauthorized' | 'forbidden' | 'error';

export interface CameraStatus {
  connection: CameraConnectionStatus;
  details: Record<string, unknown> | null;
}

export interface CameraRead {
  id: string;
  name: string;
  description: string | null;
  connection_mode: ConnectionMode;
  url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface CameraReadWithStatus extends CameraRead {
  status: CameraStatus;
}

export interface CameraReadWithCredentials extends CameraRead {
  api_key: string;
  auth_headers: Record<string, string> | null;
}

export interface CameraCreate {
  name: string;
  description?: string | null;
  connection_mode: ConnectionMode;
  url?: string | null;
}

export interface CameraUpdate {
  name?: string | null;
  description?: string | null;
  connection_mode?: ConnectionMode | null;
  url?: string | null;
}

export interface CapturedImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  description: string;
}

export interface PairingClaimRequest {
  code: string;
  camera_name: string;
  description?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = `${API_URL}/plugins/rpi-cam/cameras`;
const PAIRING_BASE = `${API_URL}/plugins/rpi-cam/pairing`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function jsonHeaders(): Promise<Record<string, string>> {
  return { ...(await authHeaders()), 'Content-Type': 'application/json' };
}

// ─── API functions ─────────────────────────────────────────────────────────────

export async function fetchCameras(includeStatus = false): Promise<CameraReadWithStatus[]> {
  const url = new URL(BASE);
  if (includeStatus) url.searchParams.set('include_status', 'true');
  const resp = await apiFetch(url, { method: 'GET', headers: await authHeaders() });
  if (!resp.ok) throw new Error(`Failed to fetch cameras (${resp.status})`);
  return resp.json() as Promise<CameraReadWithStatus[]>;
}

export async function fetchCamera(
  id: string,
  includeStatus = false,
): Promise<CameraReadWithStatus> {
  const url = new URL(`${BASE}/${id}`);
  if (includeStatus) url.searchParams.set('include_status', 'true');
  const resp = await apiFetch(url, { method: 'GET', headers: await authHeaders() });
  if (!resp.ok) throw new Error(`Failed to fetch camera (${resp.status})`);
  return resp.json() as Promise<CameraReadWithStatus>;
}

export async function createCamera(data: CameraCreate): Promise<CameraReadWithCredentials> {
  const resp = await apiFetch(BASE, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Failed to create camera (${resp.status})`);
  return resp.json() as Promise<CameraReadWithCredentials>;
}

export async function updateCamera(id: string, data: CameraUpdate): Promise<CameraRead> {
  const resp = await apiFetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: await jsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Failed to update camera (${resp.status})`);
  return resp.json() as Promise<CameraRead>;
}

export async function deleteCamera(id: string): Promise<void> {
  const resp = await apiFetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!resp.ok) throw new Error(`Failed to delete camera (${resp.status})`);
}

export async function regenerateCameraApiKey(id: string): Promise<CameraReadWithCredentials> {
  const resp = await apiFetch(`${BASE}/${id}/regenerate-api-key`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!resp.ok) throw new Error(`Failed to regenerate API key (${resp.status})`);
  return resp.json() as Promise<CameraReadWithCredentials>;
}

export async function captureImageFromCamera(
  cameraId: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await apiFetch(`${BASE}/${cameraId}/image`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({ product_id: productId }),
  });
  if (!resp.ok) throw new Error(`Failed to capture image (${resp.status})`);
  // Backend returns ImageRead (snake_case) — map to frontend CapturedImage
  const data = await resp.json();
  return {
    id: String(data.id),
    url: data.image_url ?? data.url,
    thumbnailUrl: data.thumbnail_url ?? null,
    description: data.description ?? '',
  };
}

export async function fetchCameraSnapshot(cameraId: string): Promise<string> {
  const resp = await apiFetch(`${BASE}/${cameraId}/snapshot`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!resp.ok) throw new Error(`Failed to fetch snapshot (${resp.status})`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

// ─── Pairing ─────────────────────────────────────────────────────────────────

export async function claimPairingCode(
  data: PairingClaimRequest,
): Promise<CameraReadWithCredentials> {
  const resp = await apiFetch(`${PAIRING_BASE}/claim`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    const msg = body?.detail?.message ?? `Pairing failed (${resp.status})`;
    throw new Error(msg);
  }
  return resp.json() as Promise<CameraReadWithCredentials>;
}
