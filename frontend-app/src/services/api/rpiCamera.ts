import { API_URL } from '@/config';
import { getToken } from '@/services/api/authentication';
import { apiFetch } from '@/services/api/client';

export type CameraConnectionStatus = 'online' | 'offline' | 'unauthorized' | 'forbidden' | 'error';
export type CameraCredentialStatus = 'active' | 'revoked';

export interface CameraStatus {
  connection: CameraConnectionStatus;
  last_seen_at: string | null;
  details: Record<string, unknown> | null;
}

export interface CameraRead {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  relay_key_id: string;
  relay_credential_status: CameraCredentialStatus;
  created_at: string;
  updated_at: string;
}

export type ThermalState = 'normal' | 'warm' | 'throttle' | 'critical';

export interface CameraTelemetry {
  timestamp: string;
  cpu_temp_c: number | null;
  cpu_percent: number;
  mem_percent: number;
  disk_percent: number;
  preview_fps: number | null;
  preview_sessions: number;
  thermal_state: ThermalState;
  current_preview_size: [number, number] | null;
}

export interface CameraReadWithStatus extends CameraRead {
  status: CameraStatus;
  telemetry?: CameraTelemetry | null;
  /** Canonical URL of the most recent capture for this camera, or null if none yet. */
  last_image_url?: string | null;
}

export interface CameraUpdate {
  name?: string | null;
  description?: string | null;
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

export async function fetchCameras(
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
): Promise<CameraReadWithStatus[]> {
  const url = new URL(BASE);
  if (includeStatus || includeTelemetry) url.searchParams.set('include_status', 'true');
  if (includeTelemetry) url.searchParams.set('include_telemetry', 'true');
  const resp = await apiFetch(url, { method: 'GET', headers: await authHeaders() });
  if (!resp.ok) throw new Error(`Failed to fetch cameras (${resp.status})`);
  return resp.json() as Promise<CameraReadWithStatus[]>;
}

export async function fetchCamera(
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
): Promise<CameraReadWithStatus> {
  const url = new URL(`${BASE}/${id}`);
  if (includeStatus || includeTelemetry) url.searchParams.set('include_status', 'true');
  if (includeTelemetry) url.searchParams.set('include_telemetry', 'true');
  const resp = await apiFetch(url, { method: 'GET', headers: await authHeaders() });
  if (!resp.ok) throw new Error(`Failed to fetch camera (${resp.status})`);
  return resp.json() as Promise<CameraReadWithStatus>;
}

export async function fetchCameraTelemetry(cameraId: string): Promise<CameraTelemetry> {
  const resp = await apiFetch(`${BASE}/${cameraId}/telemetry`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!resp.ok) throw new Error(`Failed to fetch camera telemetry (${resp.status})`);
  return resp.json() as Promise<CameraTelemetry>;
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
  const data = await resp.json();
  return {
    id: String(data.id),
    url: data.image_url ?? data.url,
    thumbnailUrl: data.thumbnail_url ?? null,
    description: data.description ?? '',
  };
}

/**
 * LL-HLS playlist URL served by the backend's HLS proxy. Pass this to
 * ``hls.js`` (web) or ``expo-video`` (native) — the player walks the manifest
 * itself and fetches segments via the same proxy.
 */
export function buildCameraHlsUrl(cameraId: string): string {
  return `${BASE}/${cameraId}/hls/cam-preview/index.m3u8`;
}

export async function claimPairingCode(data: PairingClaimRequest): Promise<CameraRead> {
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
  return resp.json() as Promise<CameraRead>;
}
