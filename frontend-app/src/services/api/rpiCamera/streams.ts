import { fetchWithAuth } from '@/services/api/authentication';
import type { StartYouTubeStreamParams, StreamView } from './shared';
import { CAMERA_BASE, streamBase } from './shared';

function streamActionUrl(cameraId: string, action: 'start' | 'stop' | 'status') {
  const suffixByAction = {
    start: '/record/start',
    stop: '/record/stop',
    status: '/status',
  } as const;
  return `${streamBase(cameraId)}${suffixByAction[action]}`;
}

function throwStreamRequestError(action: 'start' | 'stop' | 'fetch', status: number): never {
  const messageByAction = {
    start: `Failed to start stream (${status})`,
    stop: `Failed to stop stream (${status})`,
    fetch: `Failed to fetch stream status (${status})`,
  } as const;
  throw new Error(messageByAction[action]);
}

export function buildCameraHlsUrl(cameraId: string): string {
  return `${CAMERA_BASE}/${cameraId}/hls/cam-preview/index.m3u8`;
}

export async function startYouTubeStream(
  cameraId: string,
  params: StartYouTubeStreamParams,
): Promise<StreamView> {
  const resp = await fetchWithAuth(streamActionUrl(cameraId, 'start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
  });
  if (resp.status === 403) throw new Error('GOOGLE_OAUTH_REQUIRED');
  if (resp.status === 409) throw new Error('STREAM_ALREADY_ACTIVE');
  if (!resp.ok) throwStreamRequestError('start', resp.status);
  return resp.json() as Promise<StreamView>;
}

export async function stopYouTubeStream(cameraId: string): Promise<void> {
  const resp = await fetchWithAuth(streamActionUrl(cameraId, 'stop'), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok && resp.status !== 204) throwStreamRequestError('stop', resp.status);
}

export async function getStreamStatus(cameraId: string): Promise<StreamView | null> {
  const resp = await fetchWithAuth(streamActionUrl(cameraId, 'status'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throwStreamRequestError('fetch', resp.status);
  return resp.json() as Promise<StreamView>;
}
