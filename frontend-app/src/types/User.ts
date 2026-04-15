import type { ApiUserRead } from '@/types/api';

/**
 * Frontend user model (camelCase).
 * The API returns ApiUserRead (snake_case); conversion happens in authentication.ts.
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

export type UserPreferences = {
  rpi_camera_enabled?: boolean;
  youtube_streaming_enabled?: boolean;
  products_welcome_dismissed?: boolean;
  theme_mode?: ThemeMode;
  [key: string]: unknown;
};

export type User = {
  id: ApiUserRead['id'];
  email: ApiUserRead['email'];
  isActive: boolean;
  isSuperuser: boolean;
  isVerified: boolean;
  username: string;
  oauth_accounts: NonNullable<ApiUserRead['oauth_accounts']>;
  preferences: UserPreferences;
};
