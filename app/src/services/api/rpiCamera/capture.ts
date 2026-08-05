import { fetchWithAuth } from '@/services/api/auth/authentication';
import { throwFromResponse } from '@/services/api/errors';
import { createRequestId, fetchWithTimeout } from '@/services/api/request';
import { isSafeImageUrl, stripTrailingSlash } from '@/utils/urlSafety';
import type { CapturedImage } from './shared';
import { CAMERA_BASE } from './shared';

// A capture writes to the sensor and uploads; allow more than a liveness probe.
const LOCAL_CAPTURE_TIMEOUT_MS = 20_000;

// The local device is untrusted; drop any url whose scheme isn't a safe image scheme.
const safeImageUrl = (value: unknown): string =>
  typeof value === 'string' && isSafeImageUrl(value) ? value : '';

// An empty id used to flow all the way into the gallery, where the next save
// treats the entry as unmatched and DELETEs the freshly captured image. Fail the
// capture instead — both transports promise an id on success.
const requireImageId = (value: unknown): string => {
  const id = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  if (!id.trim()) throw new Error('Capture succeeded but the camera returned no image id.');
  return id.trim();
};

// Same for the url: a gallery entry with no url renders as a broken image.
const requireImageUrl = (value: unknown): string => {
  const url = safeImageUrl(value);
  if (!url) throw new Error('Capture succeeded but the camera returned no image URL.');
  return url;
};

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
    id: requireImageId(data.id),
    url: requireImageUrl(data.image_url ?? data.url),
    thumbnailUrl: safeImageUrl(data.thumbnail_url) || null,
    description: data.description ?? '',
  };
}

export async function captureImageLocally(
  localBaseUrl: string,
  localApiKey: string,
  productId: number,
): Promise<CapturedImage> {
  // Bounded: capture-all awaits every camera, so a half-open LAN socket here
  // would stall the whole mutation. `redirect: 'error'` keeps the device key from
  // following a redirect off the validated LAN host.
  const resp = await fetchWithTimeout(`${stripTrailingSlash(localBaseUrl)}/captures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': localApiKey,
      'X-Request-ID': createRequestId(),
    },
    body: JSON.stringify({ product_id: productId }),
    timeoutMs: LOCAL_CAPTURE_TIMEOUT_MS,
    redirect: 'error',
  });
  if (!resp.ok) await throwFromResponse(resp, 'Local capture failed');
  const data = await resp.json();
  // status 'queued' means the Pi stored the frame but hasn't uploaded it yet, so
  // image_url is null. There is nothing to show in the gallery until it syncs.
  if (data.status === 'queued') {
    throw new Error(
      'The camera saved the image but could not upload it yet. It will appear once the camera is back online.',
    );
  }
  return {
    id: requireImageId(data.image_id),
    url: requireImageUrl(data.image_url),
    thumbnailUrl: safeImageUrl(data.thumbnail_url) || null,
    description: data.description ?? '',
  };
}
