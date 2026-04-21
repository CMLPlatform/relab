import type { User } from '@/types/User';

export const authRuntime = {
  token: undefined as string | undefined,
  user: undefined as User | undefined,
  refreshPromise: null as Promise<boolean> | null,
  getUserPromise: null as Promise<User | undefined> | null,
  explicitlyLoggedOut: false,
  authGeneration: 0,
};

export function resetAuthRuntimeForTests() {
  authRuntime.token = undefined;
  authRuntime.user = undefined;
  authRuntime.refreshPromise = null;
  authRuntime.getUserPromise = null;
  authRuntime.explicitlyLoggedOut = false;
  authRuntime.authGeneration = 0;
}
