import { describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/context/auth';
import { getToken, getUser, hasWebSessionFlag } from '@/services/api/auth/authentication';
import type { User } from '@/types/User';

jest.mock('@/services/api/auth/authentication', () => ({
  getToken: jest.fn(),
  getUser: jest.fn(),
  hasWebSessionFlag: jest.fn(),
}));

const mockedGetToken = jest.mocked(getToken);
const mockedGetUser = jest.mocked(getUser);
const mockedHasWebSessionFlag = jest.mocked(hasWebSessionFlag);

const signedInUser: User = {
  id: 'u1',
  email: 'test@example.com',
  isActive: true,
  isSuperuser: false,
  isVerified: true,
  mfaEnabled: false,
  hasUsablePassword: true,
  username: 'tester',
  oauth_accounts: [],
  preferences: {},
};

describe('AuthProvider — sign-out cache clearing', () => {
  it('clears the query cache and the persisted store when the user signs out', async () => {
    // Native branch: a token means auto-login is attempted on mount.
    mockedHasWebSessionFlag.mockReturnValue(false);
    mockedGetToken.mockResolvedValue('token');
    mockedGetUser.mockResolvedValueOnce(signedInUser);

    const queryClient = new QueryClient();
    const clearSpy = jest.spyOn(queryClient, 'clear');
    const removeItemSpy = jest.spyOn(AsyncStorage, 'removeItem');

    function wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
    expect(clearSpy).not.toHaveBeenCalled();

    // Sign-out: whatever the caller (logout, revokeAllSessions), it always
    // ends in refetch(false) resolving to no user — see profile/actions.ts.
    mockedGetUser.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.refetch(false);
    });

    await waitFor(() => expect(result.current.user).toBeUndefined());
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(removeItemSpy).toHaveBeenCalledWith('relab-query-cache');
    expect(removeItemSpy).toHaveBeenCalledWith('relab-recent-categories');
  });

  it('does not clear the cache on sign-in (only on sign-out)', async () => {
    mockedHasWebSessionFlag.mockReturnValue(false);
    mockedGetToken.mockResolvedValue(undefined); // guest on mount

    const queryClient = new QueryClient();
    const clearSpy = jest.spyOn(queryClient, 'clear');
    const removeItemSpy = jest.spyOn(AsyncStorage, 'removeItem');
    removeItemSpy.mockClear();

    function wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockedGetUser.mockResolvedValueOnce(signedInUser);
    await act(async () => {
      await result.current.refetch(false);
    });

    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
    expect(clearSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });
});
