// biome-ignore lint/performance/noBarrelFile: this top-level hook facade is the stable import surface used across the app.
export {
  type CaptureAllResult,
  cameraQueryOptions,
  camerasQueryOptions,
  useCameraLivePreview,
  useCameraQuery,
  useCamerasQuery,
  useCameraTelemetryQuery,
  useCaptureAllMutation,
  useCaptureImageMutation,
  useClaimPairingMutation,
  useDeleteCameraMutation,
  useStartYouTubeStreamMutation,
  useStopYouTubeStreamMutation,
  useStreamStatusQuery,
  useUpdateCameraMutation,
} from '@/hooks/camera-data/hooks';
