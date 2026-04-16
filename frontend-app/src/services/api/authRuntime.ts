import type { User } from '@/types/User';

export const authRuntime = {
  token: undefined as string | undefined,
  user: undefined as User | undefined,
  refreshPromise: null as Promise<boolean> | null,
  getUserPromise: null as Promise<User | undefined> | null,
  explicitlyLoggedOut: false,
  authGeneration: 0,
};
