import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/services/api/client';

const OAUTH_BROWSER_TIMEOUT_MS = 5 * 60 * 1000;

export type OAuthSessionResult = Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;

export function buildOAuthAuthorizeUrl(pathname: string, redirectUri: string) {
  return `${pathname}?redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export function extractOAuthErrorDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const candidate = (payload as { detail?: unknown }).detail;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') {
    const nested = candidate as { reason?: unknown; message?: unknown };
    if (typeof nested.reason === 'string') return nested.reason;
    if (typeof nested.message === 'string') return nested.message;
  }
  return undefined;
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
      WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUri),
      timeoutPromise,
    ])) as OAuthSessionResult;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
