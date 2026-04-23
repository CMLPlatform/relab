import type { ApiUserRead } from '@/types/api';
import type { User } from '@/types/User';

export function getAuthLoginPath(web: boolean) {
  return web ? '/auth/cookie/login' : '/auth/bearer/login';
}

export function getAuthRefreshPath(web: boolean) {
  return web ? '/auth/cookie/refresh' : '/auth/refresh';
}

export function shouldSkipUserFetch({
  forceRefresh,
  explicitlyLoggedOut,
  web,
  hasWebSession,
}: {
  forceRefresh: boolean;
  explicitlyLoggedOut: boolean;
  web: boolean;
  hasWebSession: boolean;
}) {
  if (!forceRefresh && explicitlyLoggedOut) return true;
  if (web && !forceRefresh && !hasWebSession) return true;
  return false;
}

export function mapApiUserToUser(data: ApiUserRead): User {
  return {
    id: data.id,
    email: data.email,
    isActive: data.is_active,
    isSuperuser: data.is_superuser,
    isVerified: data.is_verified,
    username: data.username ?? 'Username not defined',
    oauth_accounts: data.oauth_accounts ?? [],
    preferences: data.preferences ?? {},
  };
}

export function extractApiErrorDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail) return detail;

  if (detail && typeof detail === 'object') {
    const nested = detail as { message?: unknown; reason?: unknown };
    if (typeof nested.message === 'string' && nested.message) return nested.message;
    if (typeof nested.reason === 'string' && nested.reason) return nested.reason;
  }

  return fallback;
}
