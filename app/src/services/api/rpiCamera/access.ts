import { fetchWithAuth } from '@/services/api/auth/authentication';
import { stripTrailingSlash } from '@/utils/urlSafety';
import type { LocalAccessInfo } from './shared';
import { CAMERA_BASE, isLocalAccessInfo } from './shared';

export function buildLocalHlsUrl(localBaseUrl: string): string {
  return `${stripTrailingSlash(localBaseUrl)}/preview/hls/cam-preview/index.m3u8`;
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
