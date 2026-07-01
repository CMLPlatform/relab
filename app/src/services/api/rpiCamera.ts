import {
  buildLocalHlsUrl as buildLocalHlsUrlInternal,
  fetchLocalAccessInfo as fetchLocalAccessInfoInternal,
} from './rpiCamera/access';
import {
  deleteCamera as deleteCameraInternal,
  fetchCamera as fetchCameraInternal,
  fetchCameras as fetchCamerasInternal,
  fetchCameraTelemetry as fetchCameraTelemetryInternal,
  updateCamera as updateCameraInternal,
} from './rpiCamera/cameras';
import {
  captureImageFromCamera as captureImageFromCameraInternal,
  captureImageLocally as captureImageLocallyInternal,
} from './rpiCamera/capture';
import { claimPairingCode as claimPairingCodeInternal } from './rpiCamera/pairing';
import {
  buildCameraHlsUrl as buildCameraHlsUrlInternal,
  getStreamStatus as getStreamStatusInternal,
  startYouTubeStream as startYouTubeStreamInternal,
  stopYouTubeStream as stopYouTubeStreamInternal,
} from './rpiCamera/streams';

export type {
  CameraConnectionStatus,
  CameraCredentialStatus,
  CameraRead,
  CameraReadWithStatus,
  CameraStatus,
  CameraTelemetry,
  CameraUpdate,
  CapturedImage,
  LocalAccessInfo,
  PairingClaimRequest,
  StartYouTubeStreamParams,
  StreamView,
  ThermalState,
  YouTubePrivacyStatus,
} from './rpiCamera/shared';

export function buildLocalHlsUrl(localBaseUrl: string) {
  return buildLocalHlsUrlInternal(localBaseUrl);
}

export function fetchLocalAccessInfo(cameraId: string) {
  return fetchLocalAccessInfoInternal(cameraId);
}

export function fetchCamera(
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) {
  return fetchCameraInternal(id, includeStatus, { includeTelemetry });
}

export function fetchCameras(
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) {
  return fetchCamerasInternal(includeStatus, { includeTelemetry });
}

export function fetchCameraTelemetry(cameraId: string) {
  return fetchCameraTelemetryInternal(cameraId);
}

export function updateCamera(id: string, data: import('./rpiCamera/shared').CameraUpdate) {
  return updateCameraInternal(id, data);
}

export function deleteCamera(id: string) {
  return deleteCameraInternal(id);
}

export function captureImageFromCamera(cameraId: string, productId: number) {
  return captureImageFromCameraInternal(cameraId, productId);
}

export function captureImageLocally(localBaseUrl: string, localApiKey: string, productId: number) {
  return captureImageLocallyInternal(localBaseUrl, localApiKey, productId);
}

export function claimPairingCode(data: import('./rpiCamera/shared').PairingClaimRequest) {
  return claimPairingCodeInternal(data);
}

export function buildCameraHlsUrl(cameraId: string) {
  return buildCameraHlsUrlInternal(cameraId);
}

export function getStreamStatus(cameraId: string) {
  return getStreamStatusInternal(cameraId);
}

export function startYouTubeStream(
  cameraId: string,
  params: import('./rpiCamera/shared').StartYouTubeStreamParams,
) {
  return startYouTubeStreamInternal(cameraId, params);
}

export function stopYouTubeStream(cameraId: string) {
  return stopYouTubeStreamInternal(cameraId);
}
