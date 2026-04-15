import { Buffer } from 'node:buffer';

import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/authentication';
import { resolveApiMediaUrl } from '@/services/api/media';

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

export type YouTubePrivacyStatus = 'public' | 'private' | 'unlisted';

export interface StreamView {
  mode: 'youtube';
  provider: string;
  url: string;
  started_at: string;
  metadata: Record<string, unknown>;
}

export interface StartYouTubeStreamParams {
  product_id: number;
  title?: string;
  description?: string;
  privacy_status?: YouTubePrivacyStatus;
}

const BASE = `${API_URL}/plugins/rpi-cam/cameras`;
const PAIRING_BASE = `${API_URL}/plugins/rpi-cam/pairing`;

function normalizeCameraReadWithStatus<T extends { last_image_url?: string | null }>(camera: T): T {
  return {
    ...camera,
    last_image_url: resolveApiMediaUrl(camera.last_image_url) ?? camera.last_image_url ?? null,
  };
}

export async function fetchCameras(
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
): Promise<CameraReadWithStatus[]> {
  const url = new URL(BASE);
  if (includeStatus || includeTelemetry) url.searchParams.set('include_status', 'true');
  if (includeTelemetry) url.searchParams.set('include_telemetry', 'true');
  const resp = await fetchWithAuth(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Failed to fetch cameras (${resp.status})`);
  const data = (await resp.json()) as CameraReadWithStatus[];
  return data.map((camera) => normalizeCameraReadWithStatus(camera));
}

export async function fetchCamera(
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
): Promise<CameraReadWithStatus> {
  const url = new URL(`${BASE}/${id}`);
  if (includeStatus || includeTelemetry) url.searchParams.set('include_status', 'true');
  if (includeTelemetry) url.searchParams.set('include_telemetry', 'true');
  const resp = await fetchWithAuth(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Failed to fetch camera (${resp.status})`);
  const data = (await resp.json()) as CameraReadWithStatus;
  return normalizeCameraReadWithStatus(data);
}

export async function fetchCameraTelemetry(cameraId: string): Promise<CameraTelemetry> {
  const resp = await fetchWithAuth(`${BASE}/${cameraId}/telemetry`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Failed to fetch camera telemetry (${resp.status})`);
  return resp.json() as Promise<CameraTelemetry>;
}

export async function fetchCameraSnapshot(cameraId: string, signal?: AbortSignal): Promise<string> {
  const resp = await fetchWithAuth(`${BASE}/${cameraId}/snapshot`, {
    method: 'GET',
    headers: { Accept: 'image/jpeg' },
    signal,
  });
  if (!resp.ok) throw new Error(`Failed to fetch camera snapshot (${resp.status})`);

  const contentType = resp.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  const bytes = await resp.arrayBuffer();
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
}

export async function updateCamera(id: string, data: CameraUpdate): Promise<CameraRead> {
  const resp = await fetchWithAuth(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Failed to update camera (${resp.status})`);
  return resp.json() as Promise<CameraRead>;
}

export async function deleteCamera(id: string): Promise<void> {
  const resp = await fetchWithAuth(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Failed to delete camera (${resp.status})`);
}

export async function captureImageFromCamera(
  cameraId: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await fetchWithAuth(`${BASE}/${cameraId}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

/**
 * LL-HLS playlist URL served by the Pi's FastAPI HLS proxy in local mode.
 * Routes through port 8018 (/hls/ → MediaMTX on localhost:8888) so FastAPI
 * can attach CORS and Private Network Access headers. No API key required —
 * the /hls/ route uses an IP-locality check instead.
 *
 * @param localBaseUrl - Base URL of the Pi's FastAPI server, e.g. "http://192.168.1.100:8018"
 */
export function buildLocalHlsUrl(localBaseUrl: string): string {
  return `${localBaseUrl.replace(/\/$/, '')}/hls/cam-preview/index.m3u8`;
}

/**
 * Capture a still image by calling the Pi's FastAPI directly (local mode).
 *
 * The Pi captures the image and pushes it to the backend independently via its
 * own upload queue. The returned image URL points at the backend storage, same
 * as relay-mode captures. Works even when the backend relay connection is down,
 * as long as the Pi can eventually reach the backend for the upload.
 *
 * @param localBaseUrl - Base URL of the Pi's FastAPI, e.g. "http://192.168.1.100:8018"
 * @param localApiKey  - The local API key shown on the Pi's /setup page
 * @param productId    - Product to associate the capture with
 */
export async function captureImageLocally(
  localBaseUrl: string,
  localApiKey: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await fetch(`${localBaseUrl.replace(/\/$/, '')}/images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': localApiKey,
    },
    body: JSON.stringify({ product_id: productId }),
  });
  if (!resp.ok) throw new Error(`Local capture failed (${resp.status})`);
  const data = await resp.json();
  return {
    id: String(data.image_id ?? data.id ?? ''),
    url: data.image_url ?? data.url ?? '',
    thumbnailUrl: data.thumbnail_url ?? null,
    description: data.description ?? '',
  };
}

export interface LocalAccessInfo {
  /** Local API key accepted by the Pi for direct-connect requests. */
  local_api_key: string;
  /** FastAPI base URLs to probe, e.g. ["http://192.168.1.100:8018"]. */
  candidate_urls: string[];
  /** mDNS hostname, e.g. "relab-rpi-cam-mypi.local", or null. */
  mdns_name: string | null;
}

/**
 * Fetch local direct-connection info for a camera via the relay.
 *
 * The backend relays GET /local-access-info to the Pi, which returns the
 * local API key and candidate IP addresses. Returns null when the camera is
 * offline (relay not connected) or on any network/auth error.
 */
export async function fetchLocalAccessInfo(cameraId: string): Promise<LocalAccessInfo | null> {
  try {
    const resp = await fetchWithAuth(`${BASE}/${cameraId}/local-access`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    return resp.json() as Promise<LocalAccessInfo>;
  } catch {
    return null;
  }
}

export async function claimPairingCode(data: PairingClaimRequest): Promise<CameraRead> {
  const resp = await fetchWithAuth(`${PAIRING_BASE}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    const msg = body?.detail?.message ?? `Pairing failed (${resp.status})`;
    throw new Error(msg);
  }
  return resp.json() as Promise<CameraRead>;
}

const streamBase = (cameraId: string) => `${BASE}/${cameraId}/stream`;

export async function startYouTubeStream(
  cameraId: string,
  params: StartYouTubeStreamParams,
): Promise<StreamView> {
  const resp = await fetchWithAuth(`${streamBase(cameraId)}/record/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
  });
  if (resp.status === 403) throw new Error('GOOGLE_OAUTH_REQUIRED');
  if (resp.status === 409) throw new Error('STREAM_ALREADY_ACTIVE');
  if (!resp.ok) throw new Error(`Failed to start stream (${resp.status})`);
  return resp.json() as Promise<StreamView>;
}

export async function stopYouTubeStream(cameraId: string): Promise<void> {
  const resp = await fetchWithAuth(`${streamBase(cameraId)}/record/stop`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok && resp.status !== 204) throw new Error(`Failed to stop stream (${resp.status})`);
}

export async function getStreamStatus(cameraId: string): Promise<StreamView | null> {
  const resp = await fetchWithAuth(`${streamBase(cameraId)}/status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Failed to fetch stream status (${resp.status})`);
  return resp.json() as Promise<StreamView>;
}
