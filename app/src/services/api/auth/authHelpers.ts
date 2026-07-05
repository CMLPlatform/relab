import type { ApiUserRead } from '@/types/api';
import type { User } from '@/types/User';

export function getAuthLoginPath(web: boolean) {
  return web ? '/auth/session/login' : '/auth/bearer/login';
}

export function getAuthRefreshPath(web: boolean) {
  return web ? '/auth/session/refresh' : '/auth/bearer/refresh';
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
    mfaEnabled: data.mfa_enabled,
    username: data.username ?? null,
    oauth_accounts: data.oauth_accounts ?? [],
    preferences: data.preferences ?? {},
  };
}
