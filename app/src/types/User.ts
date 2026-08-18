import type { ApiUserRead } from './api';

/**
 * Frontend user model (camelCase).
 * The API returns ApiUserRead (snake_case); conversion happens in authentication.ts.
 */
export type ThemeMode = 'light' | 'dark' | 'auto';
export type ProfileVisibility = 'public' | 'community' | 'private';

/**
 * Contributor tier. `lab` accounts may upload non-image research files and carry a
 * larger upload quota. The backend enforces both; this only decides what to render.
 */
export type UserRole = ApiUserRead['role'];

export type UserPreferences = {
  email_updates_enabled?: boolean;
  profile_visibility?: ProfileVisibility;
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
  mfaEnabled: boolean;
  /** False for OAuth-only accounts; gates whether unlinking a social login needs a password. */
  hasUsablePassword: boolean;
  username: string | null;
  role: UserRole;
  /** True when this account should still be prompted to accept the contributor terms. */
  termsAcceptanceRequired: boolean;
  /** Upload allowances the account's role grants, with what it has already used. */
  uploadQuota: {
    files: number;
    bytes: number;
    usedFiles: number;
    usedBytes: number;
  };
  oauth_accounts: NonNullable<ApiUserRead['oauth_accounts']>;
  preferences: UserPreferences;
};
