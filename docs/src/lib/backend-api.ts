const BACKEND_API_URL_BY_MODE: Record<string, string> = {
  dev: 'http://127.0.0.1:8010',
  prod: 'https://api.cml-relab.org',
  staging: 'https://api-test.cml-relab.org',
  test: 'http://127.0.0.1:18010',
};

export function normalizeBackendApiUrl(value: string): string {
  const trimmedValue = value.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error('Backend API URL must be an absolute http(s) URL');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Backend API URL must use http or https');
  }
  return parsedUrl.toString().replace(/\/+$/, '');
}

export function backendApiUrlForMode(mode: string): string {
  const configuredUrl = import.meta.env.PUBLIC_BACKEND_API_URL?.trim();
  const fallbackUrl = BACKEND_API_URL_BY_MODE[mode] ?? BACKEND_API_URL_BY_MODE.prod;

  return normalizeBackendApiUrl(configuredUrl || fallbackUrl);
}
