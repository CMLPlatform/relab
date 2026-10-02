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

// A slightly soft 2560 WebP beats downloading a multi-megabyte original on a 3x phone.
const WIDEST_DERIVATIVE_MIN_COVERAGE = 0.75;

/**
 * The narrowest derivative at least `neededPx` wide, else the widest one if it
 * covers at least three quarters of the need; undefined when the map is empty or
 * the widest is narrower than that, so the caller falls back to its own URL
 * (usually the original) instead of stretching a small thumbnail.
 */
export function pickThumbnailUrl(
  urls: Record<number, string>,
  neededPx: number,
): string | undefined {
  const widths = Object.keys(urls)
    .map(Number)
    .sort((a, b) => a - b);
  const widest = widths.at(-1);
  const fit =
    widths.find((width) => width >= neededPx) ??
    (widest !== undefined && widest >= neededPx * WIDEST_DERIVATIVE_MIN_COVERAGE
      ? widest
      : undefined);
  return fit === undefined ? undefined : urls[fit];
}
