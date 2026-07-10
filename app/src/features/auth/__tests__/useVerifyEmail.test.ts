import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useVerifyEmail } from '@/features/auth/useVerifyEmail';

const mockReplace = jest.fn();
const mockRefetch = jest.fn();
const mockVerify = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ token: 'verify-token' }),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, refetch: mockRefetch }),
}));

jest.mock('@/services/api/auth/accountRecovery', () => ({
  verifyEmail: (...args: unknown[]) => mockVerify(...args),
}));

jest.mock('@/features/auth/useSensitiveAuthToken', () => ({
  useSensitiveAuthToken: (token: string | undefined) => token,
}));

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('useVerifyEmail post-verify redirect', () => {
  // Regression: the redirect chained `refetch(true).then(() => replace(...))`
  // with no catch, so a transient refetch rejection stranded the signed-in user
  // on the success screen forever (plus an unhandled rejection). It must navigate
  // regardless of the refetch outcome.
  it('navigates to /products even when the post-verify refetch rejects', async () => {
    mockVerify.mockImplementation(async () => undefined);
    mockRefetch.mockImplementation(async () => {
      throw new Error('network');
    });
    jest.useFakeTimers();

    renderHook(() => useVerifyEmail());

    // Let the verify effect resolve so `success` flips true and schedules the timer.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');
  });
});
