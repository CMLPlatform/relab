import { openAuthSessionAsync } from 'expo-web-browser';
import { SUPPORT_EMAIL } from '@/constants';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import { parseApiErrorDetail } from '@/services/api/errors';

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

/** Shown when either URL guard below rejects a URL; the two cases read the same to a user. */
export const OAUTH_BLOCKED_URL_MESSAGE =
  `The sign-in provider sent a web address we do not recognise, so we stopped. ` +
  `Try again. If it keeps happening, email ${SUPPORT_EMAIL}.`;

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

export function parseOAuthCallbackUrl(url: string): OAuthCallbackResult | undefined {
  // A malformed browser-session URL reads as "no callback here" rather than throwing.
  let callbackUrl: URL;
  try {
    callbackUrl = new URL(url);
  } catch {
    return undefined;
  }

  const params = new URLSearchParams(callbackUrl.hash.replace(LEADING_HASH_PATTERN, ''));
  const status = params.get('status');
  const error = params.get('error');
  const mfaHandoff = params.get('mfa_handoff');

  // Not an OAuth callback fragment (an anchor or tracking hash).
  if (status === null && error === null && mfaHandoff === null) return undefined;

  return {
    status: status === 'success' || status === 'mfa_required' ? status : 'error',
    error: error ?? undefined,
    mfaHandoff: mfaHandoff ?? undefined,
  };
}

export async function fetchOAuthAuthorizationUrl(
  authorizeUrl: string,
  stepUp?: { currentPassword?: string },
) {
  // Association authorize is a POST: the step-up password must travel in a
  // body. Login authorize stays a GET.
  const init = stepUp
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          stepUp.currentPassword ? { current_password: stepUp.currentPassword } : {},
        ),
      }
    : {};
  const response = await fetchWithAuth(authorizeUrl, init);
  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    detail: parseApiErrorDetail(payload),
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
