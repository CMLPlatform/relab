import { fetchWithAuth } from '@/services/api/authentication';
import type { LocalAccessInfo } from './shared';
import { CAMERA_BASE, isLocalAccessInfo } from './shared';

const TRAILING_SLASH_PATTERN = /\/$/;

export function buildLocalHlsUrl(localBaseUrl: string): string {
  return `${localBaseUrl.replace(TRAILING_SLASH_PATTERN, '')}/preview/hls/cam-preview/index.m3u8`;
}

export async function fetchLocalAccessInfo(cameraId: string): Promise<LocalAccessInfo | null> {
  try {
    const resp = await fetchWithAuth(`${CAMERA_BASE}/${cameraId}/local-access`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as unknown;
    return isLocalAccessInfo(payload) ? payload : null;
  } catch {
    return null;
  }
}
