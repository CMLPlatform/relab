import { fetchWithAuth } from '@/services/api/auth/authentication';
import { ApiError, throwFromResponse } from '@/services/api/errors';
import type { StartYouTubeStreamParams, StreamView } from './shared';
import { CAMERA_BASE } from './shared';

function recordingStreamUrl(cameraId: string) {
  return `${CAMERA_BASE}/${cameraId}/recording-stream`;
}

export function buildCameraHlsUrl(cameraId: string): string {
  return `${CAMERA_BASE}/${cameraId}/hls/cam-preview/index.m3u8`;
}

export async function startYouTubeStream(
  cameraId: string,
  params: StartYouTubeStreamParams,
): Promise<StreamView> {
  const resp = await fetchWithAuth(recordingStreamUrl(cameraId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
  });
  if (resp.status === 403) {
    throw new ApiError(
      'Google account not linked for YouTube streaming.',
      403,
      'GOOGLE_OAUTH_REQUIRED',
    );
  }
  if (resp.status === 409) {
    throw new ApiError('A stream is already active for this camera.', 409, 'STREAM_ALREADY_ACTIVE');
  }
  if (!resp.ok) await throwFromResponse(resp, 'Failed to start stream');
  return resp.json() as Promise<StreamView>;
}

export async function stopYouTubeStream(cameraId: string): Promise<void> {
  const resp = await fetchWithAuth(recordingStreamUrl(cameraId), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok && resp.status !== 204) await throwFromResponse(resp, 'Failed to stop stream');
}

export async function getStreamStatus(cameraId: string): Promise<StreamView | null> {
  const resp = await fetchWithAuth(recordingStreamUrl(cameraId), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) await throwFromResponse(resp, 'Failed to fetch stream status');
  return resp.json() as Promise<StreamView>;
}
