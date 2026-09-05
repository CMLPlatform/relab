import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useMfaScreen } from '@/features/auth/useMfaScreen';
import { completeMfaChallenge, getPendingMfaLogin } from '@/services/api/auth/authMfa';

jest.mock('@/services/api/auth/authMfa', () => ({
  completeMfaChallenge: jest.fn(),
  clearPendingMfaLogin: jest.fn(),
  getPendingMfaLogin: jest.fn(),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => ({ refetch: jest.fn(async () => undefined) }),
}));

const mockComplete = completeMfaChallenge as jest.Mock<typeof completeMfaChallenge>;
const mockPending = getPendingMfaLogin as jest.Mock<typeof getPendingMfaLogin>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('useMfaScreen guards', () => {
  // Regression: the guard read `isSubmitting` from state, so two submits in the
  // same tick both saw the stale `false`. A TOTP code is single-use — the second
  // request burns it and the user sees "Invalid MFA code" after a real success.
  it('ignores a second submit while the first is in flight', async () => {
    mockPending.mockReturnValue({ status: 'mfa_required', mfaToken: 'tok' });
    let release: () => void = () => {};
    mockComplete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );

    const { result } = renderHook(() => useMfaScreen());
    act(() => result.current.handleCodeChange('123456'));

    await act(async () => {
      void result.current.submit();
      void result.current.submit();
      await Promise.resolve();
    });

    expect(mockComplete).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
  });
});
