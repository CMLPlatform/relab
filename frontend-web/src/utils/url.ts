const TRAILING_SLASHES_PATTERN = /\/+$/;
const API_VERSION_PATH = '/v1';

export function joinApiUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    throw new Error(`joinApiUrl: baseUrl is ${baseUrl}; is PUBLIC_API_URL set?`);
  }
  const base = baseUrl.replace(TRAILING_SLASHES_PATTERN, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function joinVersionedApiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(TRAILING_SLASHES_PATTERN, '');
  const versionedBase = base.endsWith(API_VERSION_PATH) ? base : `${base}${API_VERSION_PATH}`;
  return joinApiUrl(versionedBase, path);
}
