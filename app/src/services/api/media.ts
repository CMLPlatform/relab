import { API_ORIGIN_URL } from '@/config';
import { hasUrlScheme, isHttpUrl } from '@/utils/urlSafety';

const apiBaseUrl = API_ORIGIN_URL.replace(/\/+$/, '');

export function resolveApiMediaUrl(path?: string | null): string | undefined {
  const trimmedPath = path?.trim();
  if (!trimmedPath) {
    return;
  }

  // Absolute URLs from the API must be http(s); file:/blob:/content: are only
  // legitimate for locally-picked images, never for server-supplied paths.
  if (isHttpUrl(trimmedPath)) {
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
