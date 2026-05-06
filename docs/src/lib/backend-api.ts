const BACKEND_API_URL_BY_MODE: Record<string, string> = {
  dev: 'http://127.0.0.1:8001',
  prod: 'https://api.cml-relab.org',
  staging: 'https://api-test.cml-relab.org',
  test: 'http://127.0.0.1:8001',
};

export function normalizeBackendApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function backendApiUrlForMode(mode: string): string {
  const configuredUrl = import.meta.env.PUBLIC_BACKEND_API_URL?.trim();
  const fallbackUrl = BACKEND_API_URL_BY_MODE[mode] ?? BACKEND_API_URL_BY_MODE.prod;

  return normalizeBackendApiUrl(configuredUrl || fallbackUrl);
}
