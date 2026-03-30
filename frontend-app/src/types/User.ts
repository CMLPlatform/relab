import type { ApiUserRead } from '@/types/api';

/**
 * Frontend user model (camelCase).
 * The API returns ApiUserRead (snake_case); conversion happens in authentication.ts.
 */
export type User = {
  id: ApiUserRead['id'];
  email: ApiUserRead['email'];
  isActive: boolean;
  isSuperuser: boolean;
  isVerified: boolean;
  username: string;
  oauth_accounts: NonNullable<ApiUserRead['oauth_accounts']>;
};
