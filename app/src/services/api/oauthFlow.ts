import { openAuthSessionAsync } from 'expo-web-browser';
import { apiFetch } from '@/services/api/client';

const OAUTH_BROWSER_TIMEOUT_MS = 5 * 60 * 1000;
const ALLOWED_OAUTH_HOSTNAMES = new Set(['accounts.google.com', 'github.com']);

export type OAuthSessionResult = Awaited<ReturnType<typeof openAuthSessionAsync>>;

export type OAuthCallbackResult = {
  success: boolean;
  error?: string;
  detail?: string;
  mfaHandoff?: string;
};

export function buildOAuthAuthorizeUrl(pathname: string, redirectUri: string) {
  return `${pathname}?redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export function extractOAuthErrorDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return;
  const candidate = (payload as { detail?: unknown }).detail;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') {
    const nested = candidate as { reason?: unknown; message?: unknown };
    if (typeof nested.reason === 'string') return nested.reason;
    if (typeof nested.message === 'string') return nested.message;
  }
  return;
}

export function isAllowedOAuthRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_OAUTH_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isExpectedOAuthCallbackUrl(url: string, redirectUri: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(redirectUri);
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

export function parseOAuthCallbackUrl(url: string): OAuthCallbackResult {
  const callbackUrl = new URL(url);
  const params = new URLSearchParams(callbackUrl.search);
  if (callbackUrl.hash) {
    const fragmentParams = new URLSearchParams(callbackUrl.hash.slice(1));
    fragmentParams.forEach((value, key) => {
      params.set(key, value);
    });
  }

  return {
    success: params.get('success') === 'true',
    error: params.get('error') ?? undefined,
    detail: params.get('detail') ?? undefined,
    mfaHandoff: params.get('mfa_handoff') ?? undefined,
  };
}

export async function fetchOAuthAuthorizationUrl(
  authorizeUrl: string,
  headers?: Record<string, string>,
) {
  const response = await apiFetch(authorizeUrl, headers ? { headers } : undefined);
  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    detail: extractOAuthErrorDetail(payload),
    authorizationUrl:
      payload && typeof payload === 'object' && 'authorization_url' in payload
        ? String((payload as { authorization_url: unknown }).authorization_url)
        : undefined,
  };
}

export async function openOAuthBrowserSession(
  authorizationUrl: string,
  redirectUri: string,
  timeoutMs = OAUTH_BROWSER_TIMEOUT_MS,
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('OAuth browser session timed out. Please try again.')),
      timeoutMs,
    );
  });

  try {
    return (await Promise.race([
      openAuthSessionAsync(authorizationUrl, redirectUri),
      timeoutPromise,
    ])) as OAuthSessionResult;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
