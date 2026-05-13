import { API_URL } from '@/config';
import { extractApiErrorDetail } from './authHelpers';
import { persistAccessToken, persistRefreshToken } from './authRefresh';
import { authRuntime } from './authRuntime';
import { isWeb, setWebSessionFlag } from './authSession';
import { fetchWithTimeout } from './request';

export type TotpSetup = {
  setupToken: string;
  secret: string;
  otpauthUri: string;
};

export type MfaLoginPending = {
  status: 'mfa_required';
  mfaToken: string;
  redirectTo?: string;
};

const MFA_PENDING_STORAGE_KEY = 'relab.pendingMfaLogin';

let pendingMfaLogin: MfaLoginPending | undefined;

function getSessionStorage(): Storage | undefined {
  if (!isWeb() || typeof globalThis.sessionStorage === 'undefined') return;
  return globalThis.sessionStorage;
}

export function setPendingMfaLogin(pending: MfaLoginPending): void {
  pendingMfaLogin = pending;
  getSessionStorage()?.setItem(MFA_PENDING_STORAGE_KEY, JSON.stringify(pending));
}

export function getPendingMfaLogin(): MfaLoginPending | undefined {
  if (pendingMfaLogin) return pendingMfaLogin;
  const raw = getSessionStorage()?.getItem(MFA_PENDING_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    pendingMfaLogin = parseMfaPendingPayload(parsed);
    if (!pendingMfaLogin) {
      clearPendingMfaLogin();
    }
  } catch {
    clearPendingMfaLogin();
  }
  return pendingMfaLogin;
}

export function clearPendingMfaLogin(): void {
  pendingMfaLogin = undefined;
  getSessionStorage()?.removeItem(MFA_PENDING_STORAGE_KEY);
}

function parseSafeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return;
  try {
    const resolved = new URL(value, 'https://placeholder.invalid');
    if (resolved.origin !== 'https://placeholder.invalid') return;
  } catch {
    return;
  }
  return value;
}

export function parseMfaPendingPayload(data: unknown): MfaLoginPending | undefined {
  if (!data || typeof data !== 'object') return;
  const pending = data as Partial<MfaLoginPending>;
  if (pending.status === 'mfa_required' && typeof pending.mfaToken === 'string') {
    return {
      status: 'mfa_required',
      mfaToken: pending.mfaToken,
      redirectTo: parseSafeRedirect(pending.redirectTo),
    };
  }
  const payload = data as {
    mfa_required?: unknown;
    mfa_token?: unknown;
  };
  if (payload.mfa_required !== true || typeof payload.mfa_token !== 'string') return;
  return {
    status: 'mfa_required',
    mfaToken: payload.mfa_token,
  };
}

function markMfaWebSessionActive(): void {
  if (!isWeb()) return;
  authRuntime.explicitlyLoggedOut = false;
  setWebSessionFlag(true);
}

function mapTotpSetup(data: unknown): TotpSetup {
  const payload = data as { setup_token?: unknown; secret?: unknown; otpauth_uri?: unknown };
  if (
    typeof payload?.setup_token !== 'string' ||
    typeof payload.secret !== 'string' ||
    typeof payload.otpauth_uri !== 'string'
  ) {
    throw new Error('Invalid MFA setup response.');
  }
  return {
    setupToken: payload.setup_token,
    secret: payload.secret,
    otpauthUri: payload.otpauth_uri,
  };
}

async function postMfaJson(
  path: string,
  body: Record<string, string>,
  fallbackError: string,
): Promise<Response> {
  const response = await fetchWithTimeout(new URL(`${API_URL}${path}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(extractApiErrorDetail(errorData, fallbackError));
  }
  return response;
}

async function persistMfaLoginResponse(response: Response): Promise<void> {
  if (response.status === 204) {
    markMfaWebSessionActive();
    return;
  }
  const data = await response.json().catch(() => null);
  if (typeof data?.access_token === 'string') {
    await persistAccessToken(data.access_token);
    if (typeof data.refresh_token === 'string') {
      await persistRefreshToken(data.refresh_token);
    }
    return;
  }
  throw new Error('Invalid MFA login response.');
}

export async function startTotpSetup(): Promise<TotpSetup> {
  const response = await postMfaJson('/auth/mfa/totp/setup', {}, 'Unable to start MFA setup.');
  return mapTotpSetup(await response.json());
}

export async function claimOAuthMfaHandoff(mfaHandoff: string): Promise<MfaLoginPending> {
  const response = await postMfaJson(
    '/auth/mfa/oauth/claim',
    { mfa_handoff: mfaHandoff },
    'Unable to claim MFA challenge.',
  );
  const pending = parseMfaPendingPayload(await response.json().catch(() => null));
  if (!pending) {
    throw new Error('Invalid MFA handoff response.');
  }
  return pending;
}

export async function confirmTotpSetup(setupToken: string, code: string): Promise<void> {
  await postMfaJson(
    '/auth/mfa/totp/confirm',
    { setup_token: setupToken, code },
    'Unable to confirm MFA setup.',
  );
}

export async function completeMfaChallenge(mfaToken: string, code: string): Promise<void> {
  const response = await postMfaJson(
    '/auth/mfa/challenge',
    { mfa_token: mfaToken, code },
    'Invalid MFA code.',
  );
  await persistMfaLoginResponse(response);
}
