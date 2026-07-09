const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const IMAGE_PROTOCOLS = new Set([...HTTP_PROTOCOLS, 'file:', 'blob:', 'content:']);
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
// Two slash-like chars ('//host', '/\host', '\\host') resolve protocol-relative
// to an external origin, so they can't be treated as same-origin relative paths.
const PROTOCOL_RELATIVE_PATTERN = /^[/\\][/\\]/;
const TRAILING_SLASH_PATTERN = /\/+$/;

export function hasUrlScheme(value: string): boolean {
  return URL_SCHEME_PATTERN.test(value.trim());
}

/** Strip all trailing slashes so a base URL joins cleanly with a path segment. */
export function stripTrailingSlash(value: string): string {
  return value.replace(TRAILING_SLASH_PATTERN, '');
}

/**
 * Whether a hostname names a device on the local network.
 *
 * Gate for anything that sends a device credential to a host we did not choose
 * ourselves (server-supplied candidate URLs, user-typed addresses, values read
 * back from storage), so a secret can never leave the LAN.
 */
export function isPrivateLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
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
