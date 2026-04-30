import { API_ORIGIN_URL } from '@/config';
import { hasUrlScheme, isSafeImageUrl } from '@/utils/urlSafety';

const apiBaseUrl = API_ORIGIN_URL.replace(/\/+$/, '');

export const API_PLACEHOLDER_IMAGE_PATH = '/static/images/placeholder.png';

export function resolveApiMediaUrl(path?: string | null): string | undefined {
  const trimmedPath = path?.trim();
  if (!trimmedPath) {
    return;
  }

  if (isSafeImageUrl(trimmedPath) && !trimmedPath.startsWith('/')) {
    return trimmedPath;
  }
  if (trimmedPath.startsWith('//') || hasUrlScheme(trimmedPath)) {
    return;
  }

  if (!apiBaseUrl) {
    return trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
  }

  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
  return `${apiBaseUrl}${normalizedPath}`;
}

export function getPlaceholderImageUrl() {
  return resolveApiMediaUrl(API_PLACEHOLDER_IMAGE_PATH) ?? API_PLACEHOLDER_IMAGE_PATH;
}

export function getResizedImageUrl(
  imageUrl: string,
  imageId: string | undefined,
  width: number,
): string {
  void imageId;
  void width;
  return resolveApiMediaUrl(imageUrl) ?? getPlaceholderImageUrl();
}
