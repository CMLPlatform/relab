import { API_URL } from '@/config';

const apiBaseUrl = API_URL.replace(/\/+$/, '');

export const API_PLACEHOLDER_IMAGE_PATH = '/static/images/placeholder.png';

const PASSTHROUGH_SCHEMES = ['http://', 'https://', 'file://', 'data:', 'blob:', 'content://'];

export function resolveApiMediaUrl(path?: string | null): string | undefined {
  if (!path) {
    return undefined;
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

export function getPlaceholderImageUrl(): string {
  return resolveApiMediaUrl(API_PLACEHOLDER_IMAGE_PATH) ?? API_PLACEHOLDER_IMAGE_PATH;
}
