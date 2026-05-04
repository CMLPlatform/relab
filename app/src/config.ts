import { normalizeHttpUrl } from '@/utils/urlSafety';

const API_VERSION_PATH = '/v1';
const DEFAULT_API_ORIGIN_URL = 'http://localhost:8000';
const TRAILING_SLASHES_PATTERN = /\/+$/;

export function normalizeRequiredHttpUrl(value: string | undefined, key: string): string {
  const url = normalizeHttpUrl(value);
  if (url) {
    return url;
  }
  throw new Error(`${key} must be an http(s) URL`);
}

export function normalizeOptionalHttpUrl(value: string | undefined, key: string): string {
  const trimmedValue = `${value ?? ''}`.trim();
  return trimmedValue ? normalizeRequiredHttpUrl(trimmedValue, key) : '';
}

function appendApiVersion(baseUrl: string | undefined): string {
  const normalizedBase = `${baseUrl ?? ''}`.replace(TRAILING_SLASHES_PATTERN, '');
  if (!normalizedBase) return API_VERSION_PATH;
  return normalizedBase.endsWith(API_VERSION_PATH)
    ? normalizedBase
    : `${normalizedBase}${API_VERSION_PATH}`;
}

export const API_ORIGIN_URL = normalizeRequiredHttpUrl(
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_ORIGIN_URL,
  'EXPO_PUBLIC_API_URL',
);

export const API_URL = appendApiVersion(API_ORIGIN_URL);

export const WEBSITE_URL = normalizeOptionalHttpUrl(
  process.env.EXPO_PUBLIC_WEBSITE_URL,
  'EXPO_PUBLIC_WEBSITE_URL',
);

export const DOCS_URL = normalizeOptionalHttpUrl(
  process.env.EXPO_PUBLIC_DOCS_URL,
  'EXPO_PUBLIC_DOCS_URL',
);
