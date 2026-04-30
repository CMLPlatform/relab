const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const IMAGE_PROTOCOLS = new Set([...HTTP_PROTOCOLS, 'file:', 'blob:', 'content:']);
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export function hasUrlScheme(value: string): boolean {
  return URL_SCHEME_PATTERN.test(value.trim());
}

export function parseAbsoluteUrl(value: string | undefined): URL | null {
  const trimmedValue = `${value ?? ''}`.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue);
  } catch {
    return null;
  }
}

export function normalizeHttpUrl(value: string | undefined): string | undefined {
  const url = parseAbsoluteUrl(value);
  return url && HTTP_PROTOCOLS.has(url.protocol) ? url.toString() : undefined;
}

export function isHttpUrl(value: string | undefined): boolean {
  return normalizeHttpUrl(value) !== undefined;
}

export function isSafeImageUrl(value: string | undefined): boolean {
  const trimmedValue = `${value ?? ''}`.trim();
  if (!trimmedValue || trimmedValue.startsWith('//')) {
    return false;
  }
  if (trimmedValue.startsWith('/')) {
    return true;
  }

  const url = parseAbsoluteUrl(trimmedValue);
  return url !== null && IMAGE_PROTOCOLS.has(url.protocol);
}
