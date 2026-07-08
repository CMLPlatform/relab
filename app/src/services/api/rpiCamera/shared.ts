import { API_URL } from '@/config';
import { resolveApiMediaUrl } from '@/services/api/media';
import type {
  ApiCameraConnectionStatus,
  ApiCameraCredentialStatus,
  ApiCameraRead,
  ApiCameraReadWithStatus,
  ApiCameraStatus,
  ApiCameraTelemetry,
  ApiCameraUpdate,
  ApiLocalAccessInfo,
  ApiPairingClaimRequest,
  ApiStreamView,
  ApiThermalState,
  ApiYouTubePrivacyStatus,
} from '@/types/api';

export type CameraConnectionStatus = ApiCameraConnectionStatus;
export type CameraCredentialStatus = ApiCameraCredentialStatus;
export type CameraStatus = ApiCameraStatus;
export type CameraRead = ApiCameraRead;
export type ThermalState = ApiThermalState;
export type CameraTelemetry = ApiCameraTelemetry;
export type CameraReadWithStatus = ApiCameraReadWithStatus;
export type LocalAccessInfo = ApiLocalAccessInfo;
export type PairingClaimRequest = ApiPairingClaimRequest;
export type StreamView = ApiStreamView;

export type CameraUpdate = ApiCameraUpdate;

export interface CapturedImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  description: string;
}

export type YouTubePrivacyStatus = ApiYouTubePrivacyStatus;

export interface StartYouTubeStreamParams {
  product_id: number;
  title?: string;
  description?: string;
  privacy_status?: YouTubePrivacyStatus;
}

export const CAMERA_BASE = `${API_URL}/plugins/rpi-cam/cameras`;
export const PAIRING_BASE = `${API_URL}/plugins/rpi-cam/pairing`;

export function normalizeCameraReadWithStatus<T extends { preview_thumbnail_url?: string | null }>(
  camera: T,
): T {
  return {
    ...camera,
    preview_thumbnail_url: resolveApiMediaUrl(camera.preview_thumbnail_url) ?? null,
  };
}

export function isLocalAccessInfo(value: unknown): value is LocalAccessInfo {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.local_api_key === 'string' &&
    candidate.local_api_key.length > 0 &&
    Array.isArray(candidate.candidate_urls) &&
    candidate.candidate_urls.length <= 16 &&
    candidate.candidate_urls.every((url) => typeof url === 'string') &&
    (candidate.mdns_name === null || typeof candidate.mdns_name === 'string')
  );
}
