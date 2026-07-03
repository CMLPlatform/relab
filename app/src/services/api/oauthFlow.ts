import { openAuthSessionAsync } from 'expo-web-browser';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import { extractApiErrorDetail } from '@/services/api/auth/authHelpers';

const OAUTH_BROWSER_TIMEOUT_MS = 5 * 60 * 1000;
const ALLOWED_OAUTH_HOSTNAMES = new Set(['accounts.google.com', 'github.com']);
const LEADING_HASH_PATTERN = /^#/;

export type OAuthSessionResult = Awaited<ReturnType<typeof openAuthSessionAsync>>;

export type OAuthCallbackResult = {
  status: 'success' | 'error' | 'mfa_required';
  error?: string;
  mfaHandoff?: string;
};

export function buildOAuthAuthorizeUrl(pathname: string, redirectUri: string) {
  return `${pathname}?redirect_uri=${encodeURIComponent(redirectUri)}`;
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
  const params = new URLSearchParams(callbackUrl.hash.replace(LEADING_HASH_PATTERN, ''));
  const status = params.get('status');

  return {
    status: status === 'success' || status === 'mfa_required' ? status : 'error',
    error: params.get('error') ?? undefined,
    mfaHandoff: params.get('mfa_handoff') ?? undefined,
  };
}

export async function fetchOAuthAuthorizationUrl(authorizeUrl: string) {
  // fetchWithAuth attaches the bearer token when a session exists (association
  // flows) and is a plain fetch when none does (login flows).
  const response = await fetchWithAuth(authorizeUrl, {});
  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    detail: extractApiErrorDetail(payload),
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
