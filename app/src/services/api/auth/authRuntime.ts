import type { User } from '@/types/User';

export const authRuntime = {
  token: undefined as string | undefined,
  user: undefined as User | undefined,
  refreshPromise: null as Promise<boolean> | null,
  getUserPromise: null as Promise<User | undefined> | null,
  // Monotonic id of the most recently started getUser request. A slower,
  // older fetch checks this before writing authRuntime.user so a stale
  // response can't clobber fresher data (last-started-wins).
  getUserSequence: 0,
  explicitlyLoggedOut: false,
  authGeneration: 0,
};

export function resetAuthRuntimeForTests() {
  authRuntime.token = undefined;
  authRuntime.user = undefined;
  authRuntime.refreshPromise = null;
  authRuntime.getUserPromise = null;
  authRuntime.getUserSequence = 0;
  authRuntime.explicitlyLoggedOut = false;
  authRuntime.authGeneration = 0;
}
