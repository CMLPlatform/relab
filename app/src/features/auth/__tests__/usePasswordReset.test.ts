import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useForgotPassword, useResetPassword } from '@/features/auth/usePasswordReset';
import { ApiError } from '@/services/api/errors';

const mockRequestPasswordReset = jest.fn<(email: string) => Promise<void>>();
const mockResetPassword = jest.fn<(token: string, password: string) => Promise<void>>();

jest.mock('@/services/api/auth/accountRecovery', () => ({
  requestPasswordReset: (email: string) => mockRequestPasswordReset(email),
  resetPassword: (token: string, password: string) => mockResetPassword(token, password),
}));

jest.mock('@/utils/logging', () => ({ logError: jest.fn() }));

// These tests exercise what happens *after* submit — the error branches, which had
// no coverage at all. The Zod resolver would otherwise block handleSubmit on the
// hooks' empty default values and the handler would never run. The schemas
// themselves are covered by services/api/validation/__tests__/userSchema.test.ts.
jest.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => async (values: Record<string, unknown>) => ({ values, errors: {} }),
}));

const INVALID_LINK_PATTERN = /invalid/i;
const RESET_FAILED_PATTERN = /couldn't reset your password/i;
const GENERIC_ERROR_PATTERN = /something went wrong/i;

beforeEach(() => {
  mockRequestPasswordReset.mockReset();
  mockResetPassword.mockReset();
  mockRequestPasswordReset.mockResolvedValue(undefined);
  mockResetPassword.mockResolvedValue(undefined);
});

describe('useResetPassword', () => {
  it('rejects a missing token without calling the API', async () => {
    const { result } = renderHook(() => useResetPassword(undefined));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.error).toMatch(INVALID_LINK_PATTERN));
    expect(mockResetPassword).not.toHaveBeenCalled();
    expect(result.current.success).toBe(false);
  });

  it('surfaces the server message when the reset token has expired', async () => {
    // An expired link is the most likely failure of this screen, and the user can
    // only recover if the reason actually reaches them.
    mockResetPassword.mockRejectedValue(new ApiError('Reset token expired', 400));
    const { result } = renderHook(() => useResetPassword('expired-token'));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.error).toBe('Reset token expired'));
    expect(result.current.success).toBe(false);
  });

  it('falls back to a generic message for a non-API failure', async () => {
    // A dropped connection is not an ApiError, so it must not leak a raw
    // TypeError message into the UI.
    mockResetPassword.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = renderHook(() => useResetPassword('token'));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.error).toMatch(RESET_FAILED_PATTERN));
    expect(result.current.success).toBe(false);
  });
});

describe('useForgotPassword', () => {
  it('surfaces a network failure instead of reporting success', async () => {
    mockRequestPasswordReset.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.error).toMatch(GENERIC_ERROR_PATTERN));
    expect(result.current.success).toBe(false);
  });

  it('surfaces the server message for an API failure', async () => {
    mockRequestPasswordReset.mockRejectedValue(new ApiError('Too many requests', 429));
    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.error).toBe('Too many requests'));
  });
});
