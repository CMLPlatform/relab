import { fetchWithAuth } from '@/services/api/auth/authentication';
import { throwFromResponse } from '@/services/api/errors';
import { createRequestId } from '@/services/api/request';
import { isSafeImageUrl, stripTrailingSlash } from '@/utils/urlSafety';
import type { CapturedImage } from './shared';
import { CAMERA_BASE } from './shared';

// The local device is untrusted; drop any url whose scheme isn't a safe image scheme.
const safeImageUrl = (value: unknown): string =>
  typeof value === 'string' && isSafeImageUrl(value) ? value : '';

export async function captureImageFromCamera(
  cameraId: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await fetchWithAuth(`${CAMERA_BASE}/${cameraId}/captures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to capture image');
  const data = await resp.json();
  return {
    id: String(data.id),
    url: safeImageUrl(data.image_url ?? data.url),
    thumbnailUrl: safeImageUrl(data.thumbnail_url) || null,
    description: data.description ?? '',
  };
}

export async function captureImageLocally(
  localBaseUrl: string,
  localApiKey: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await fetch(`${stripTrailingSlash(localBaseUrl)}/captures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': localApiKey,
      'X-Request-ID': createRequestId(),
    },
    body: JSON.stringify({ product_id: productId }),
  });
  if (!resp.ok) await throwFromResponse(resp, 'Local capture failed');
  const data = await resp.json();
  return {
    id: String(data.image_id ?? data.id ?? ''),
    url: safeImageUrl(data.image_url ?? data.url),
    thumbnailUrl: safeImageUrl(data.thumbnail_url) || null,
    description: data.description ?? '',
  };
}
