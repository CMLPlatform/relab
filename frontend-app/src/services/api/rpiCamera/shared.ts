import { API_URL } from '@/config';
import { resolveApiMediaUrl } from '@/services/api/media';
import type {
  ApiCameraConnectionStatus,
  ApiCameraCredentialStatus,
  ApiCameraRead,
  ApiCameraReadWithStatus,
  ApiCameraStatus,
  ApiCameraTelemetry,
  ApiLocalAccessInfo,
  ApiPairingClaimRequest,
  ApiStreamView,
  ApiThermalState,
} from '@/types/api';

export type CameraConnectionStatus = ApiCameraConnectionStatus;
export type CameraCredentialStatus = ApiCameraCredentialStatus;
export type CameraStatus = ApiCameraStatus;
export type CameraRead = ApiCameraRead;
export type ThermalState = ApiThermalState;
export type CameraTelemetry = ApiCameraTelemetry;
export type CameraReadWithStatus = ApiCameraReadWithStatus & {
  last_image_thumbnail_url?: string | null;
  last_preview_thumbnail_url?: string | null;
};
export type LocalAccessInfo = ApiLocalAccessInfo;
export type PairingClaimRequest = ApiPairingClaimRequest;
export type StreamView = ApiStreamView;

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

export type YouTubePrivacyStatus = 'public' | 'private' | 'unlisted';

export interface StartYouTubeStreamParams {
  product_id: number;
  title?: string;
  description?: string;
  privacy_status?: YouTubePrivacyStatus;
}

export const CAMERA_BASE = `${API_URL}/plugins/rpi-cam/cameras`;
export const PAIRING_BASE = `${API_URL}/plugins/rpi-cam/pairing`;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function throwFromResponse(resp: Response, fallback: string): Promise<never> {
  const body = await resp.json().catch(() => null);
  const detail = body?.detail;
  const message =
    (typeof detail === 'string' ? detail : detail?.message) ?? `${fallback} (${resp.status})`;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  throw new ApiError(message, resp.status, code);
}

export function normalizeCameraReadWithStatus<
  T extends {
    last_image_url?: string | null;
    last_image_thumbnail_url?: string | null;
    last_preview_thumbnail_url?: string | null;
  },
>(camera: T): T {
  return {
    ...camera,
    last_image_url: resolveApiMediaUrl(camera.last_image_url) ?? camera.last_image_url ?? null,
    last_image_thumbnail_url:
      resolveApiMediaUrl(camera.last_image_thumbnail_url) ??
      camera.last_image_thumbnail_url ??
      null,
    last_preview_thumbnail_url:
      resolveApiMediaUrl(camera.last_preview_thumbnail_url) ??
      camera.last_preview_thumbnail_url ??
      null,
  };
}

export function isLocalAccessInfo(value: unknown): value is LocalAccessInfo {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.local_api_key === 'string' &&
    Array.isArray(candidate.candidate_urls) &&
    candidate.candidate_urls.every((url) => typeof url === 'string') &&
    (candidate.mdns_name === null || typeof candidate.mdns_name === 'string')
  );
}

export const streamBase = (cameraId: string) => `${CAMERA_BASE}/${cameraId}/stream`;
