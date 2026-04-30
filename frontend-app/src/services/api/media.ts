import { API_ORIGIN_URL } from '@/config';

const apiBaseUrl = API_ORIGIN_URL.replace(/\/+$/, '');

export const API_PLACEHOLDER_IMAGE_PATH = '/static/images/placeholder.png';

const PASSTHROUGH_SCHEMES = ['http:', 'https:', 'file:', 'blob:', 'content:'];
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

function hasSafeMediaScheme(value: string): boolean {
  try {
    const url = new URL(value);
    return PASSTHROUGH_SCHEMES.includes(url.protocol);
  } catch {
    return false;
  }
}

export function resolveApiMediaUrl(path?: string | null): string | undefined {
  const trimmedPath = path?.trim();
  if (!trimmedPath) {
    return;
  }

  if (trimmedPath.startsWith('//') || trimmedPath.toLowerCase().startsWith('data:')) {
    return;
  }

  if (hasSafeMediaScheme(trimmedPath)) {
    return trimmedPath;
  }
  if (SCHEME_PATTERN.test(trimmedPath)) {
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
