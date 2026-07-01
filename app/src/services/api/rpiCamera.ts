// Public entry point for Raspberry Pi camera API calls.
// Re-exports the rpiCamera/ submodules under a single stable import path.
export { buildLocalHlsUrl, fetchLocalAccessInfo } from './rpiCamera/access';
export {
  deleteCamera,
  fetchCamera,
  fetchCameras,
  fetchCameraTelemetry,
  updateCamera,
} from './rpiCamera/cameras';
export { captureImageFromCamera, captureImageLocally } from './rpiCamera/capture';
export { claimPairingCode } from './rpiCamera/pairing';
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
export {
  buildCameraHlsUrl,
  getStreamStatus,
  startYouTubeStream,
  stopYouTubeStream,
} from './rpiCamera/streams';
