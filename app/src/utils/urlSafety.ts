const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const IMAGE_PROTOCOLS = new Set([...HTTP_PROTOCOLS, 'file:', 'blob:', 'content:']);
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
// Two slash-like chars ('//host', '/\host', '\\host') resolve protocol-relative
// to an external origin, so they can't be treated as same-origin relative paths.
const PROTOCOL_RELATIVE_PATTERN = /^[/\\][/\\]/;

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
  if (!trimmedValue) {
    return false;
  }
  if (PROTOCOL_RELATIVE_PATTERN.test(trimmedValue)) {
    return false;
  }
  if (trimmedValue.startsWith('/')) {
    return true;
  }

  const url = parseAbsoluteUrl(trimmedValue);
  return url !== null && IMAGE_PROTOCOLS.has(url.protocol);
}
