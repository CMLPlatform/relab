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

/**
 * Resolve an API width-keyed thumbnail map (`thumbnail_urls`) into usable URLs.
 *
 * Same per-URL rejections as `resolveApiMediaUrl`, so a server-supplied
 * `javascript:` or protocol-relative candidate is dropped rather than rendered.
 * Non-numeric or non-positive keys are dropped too.
 */
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
 * The narrowest derivative at least `neededPx` wide.
 *
 * React Native has no `srcset`: a view knows its own layout size, so it picks
 * once at render time. Returns undefined for an empty map and when no derivative
 * is wide enough, which means the caller falls back to whatever single URL it
 * already had — the original, which is always at least as wide as any derivative
 * (`generate_thumbnails` skips widths at or above the original's), so this never
 * upscales a derivative when the original would fit better.
 */
export function pickThumbnailUrl(
  urls: Record<number, string>,
  neededPx: number,
): string | undefined {
  const fit = Object.keys(urls)
    .map(Number)
    .sort((a, b) => a - b)
    .find((width) => width >= neededPx);
  return fit === undefined ? undefined : urls[fit];
}
