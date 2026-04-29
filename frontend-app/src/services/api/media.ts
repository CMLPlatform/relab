import { API_ORIGIN_URL } from '@/config';

const apiBaseUrl = API_ORIGIN_URL.replace(/\/+$/, '');

export const API_PLACEHOLDER_IMAGE_PATH = '/static/images/placeholder.png';

const PASSTHROUGH_SCHEMES = ['http://', 'https://', 'file://', 'data:', 'blob:', 'content://'];

export function resolveApiMediaUrl(path?: string | null): string | undefined {
  if (!path) {
    return;
  }

  if (PASSTHROUGH_SCHEMES.some((scheme) => path.startsWith(scheme))) {
    return path;
  }

  if (!apiBaseUrl) {
    return path.startsWith('/') ? path : `/${path}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
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
  return resolveApiMediaUrl(imageUrl) ?? imageUrl;
}
