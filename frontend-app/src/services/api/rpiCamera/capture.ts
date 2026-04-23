import { fetchWithAuth } from '@/services/api/authentication';
import { createRequestId } from '@/services/api/request';
import type { CapturedImage } from './shared';
import { CAMERA_BASE } from './shared';

const TRAILING_SLASH_PATTERN = /\/$/;

export async function captureImageFromCamera(
  cameraId: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await fetchWithAuth(`${CAMERA_BASE}/${cameraId}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  });
  if (!resp.ok) throw new Error(`Failed to capture image (${resp.status})`);
  const data = await resp.json();
  return {
    id: String(data.id),
    url: data.image_url ?? data.url,
    thumbnailUrl: data.thumbnail_url ?? null,
    description: data.description ?? '',
  };
}

export async function captureImageLocally(
  localBaseUrl: string,
  localApiKey: string,
  productId: number,
): Promise<CapturedImage> {
  const resp = await fetch(`${localBaseUrl.replace(TRAILING_SLASH_PATTERN, '')}/captures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': localApiKey,
      'X-Request-ID': createRequestId(),
    },
    body: JSON.stringify({ product_id: productId }),
  });
  if (!resp.ok) throw new Error(`Local capture failed (${resp.status})`);
  const data = await resp.json();
  return {
    id: String(data.image_id ?? data.id ?? ''),
    url: data.image_url ?? data.url ?? '',
    thumbnailUrl: data.thumbnail_url ?? null,
    description: data.description ?? '',
  };
}
