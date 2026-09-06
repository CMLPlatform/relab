import { API_ORIGIN_URL } from '@/config';
import { hasUrlScheme, isHttpUrl, stripTrailingSlash } from '@/utils/urlSafety';

const apiBaseUrl = stripTrailingSlash(API_ORIGIN_URL);

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

  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

/** Resolve `thumbnail_urls` with the same per-URL rejections as `resolveApiMediaUrl`; bad keys are dropped. */
export function resolveApiMediaUrlMap(
  urls: Record<string, string> | null | undefined,
): Record<number, string> {
  const resolved: Record<number, string> = {};
  for (const [width, path] of Object.entries(urls ?? {})) {
    const px = Number(width);
    const url = resolveApiMediaUrl(path);
    if (Number.isFinite(px) && px > 0 && url) {
      resolved[px] = url;
    }
  }
  return resolved;
}

/**
 * The narrowest derivative at least `neededPx` wide, or the widest there is;
 * undefined for an empty map. Never the original (reserved for zoom).
 * NOTE: blurs for very small originals; fall back to the original when the
 * widest derivative is far narrower than the need if that matters.
 */
export function pickThumbnailUrl(
  urls: Record<number, string>,
  neededPx: number,
): string | undefined {
  const widths = Object.keys(urls)
    .map(Number)
    .sort((a, b) => a - b);
  if (widths.length === 0) {
    return;
  }
  const fit = widths.find((width) => width >= neededPx) ?? widths[widths.length - 1];
  return urls[fit];
}
