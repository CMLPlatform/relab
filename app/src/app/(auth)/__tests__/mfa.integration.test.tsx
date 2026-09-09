import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MfaScreen from '@/app/(auth)/mfa';
import { useAuth } from '@/context/auth';
import { completeMfaChallenge, setPendingMfaLogin } from '@/services/api/auth/authMfa';
import { mockUser, renderWithProviders } from '@/test-utils/index';
import type { User } from '@/types/User';

const SESSION_ENDED_PATTERN = /sign-in session has ended/;
const ERROR_COPY_PATTERN = /expired|Invalid/;

let mockPendingMfaLogin:
  | { status: 'mfa_required'; mfaToken: string; redirectTo?: string }
  | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/services/api/auth/authMfa', () => ({
  clearPendingMfaLogin: jest.fn(() => {
    mockPendingMfaLogin = undefined;
  }),
  completeMfaChallenge: jest.fn(),
  getPendingMfaLogin: jest.fn(() => mockPendingMfaLogin),
  setPendingMfaLogin: jest.fn((pending) => {
    mockPendingMfaLogin = pending as typeof mockPendingMfaLogin;
  }),
}));

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

const mockReplace = jest.fn();
const mockRefetch = jest.fn<(forceRefresh?: boolean) => Promise<User | undefined>>();
const mockedUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedCompleteMfaChallenge = completeMfaChallenge as jest.MockedFunction<
  typeof completeMfaChallenge
>;

async function renderMfaScreen() {
  await renderWithProviders(<MfaScreen />);
}

beforeEach(() => {
  mockPendingMfaLogin = undefined;
  jest.clearAllMocks();
  mockedUseRouter.mockReturnValue({ replace: mockReplace });
  mockedUseLocalSearchParams.mockReturnValue({});
  mockRefetch.mockResolvedValue(mockUser());
  mockedUseAuth.mockReturnValue({ user: undefined, isLoading: false, refetch: mockRefetch });
  setPendingMfaLogin({ status: 'mfa_required', mfaToken: 'mfa-token' });
});

describe('MfaScreen challenge flow', () => {
  // Every auth field carries a visible label, not just the recovery-code
  // fallback — getByLabelText below only sees the accessible name, so the
  // rendered label needs its own assertion.
  it('labels the code field visibly', async () => {
    await renderMfaScreen();

    expect(screen.getByText('Authentication code')).toBeOnTheScreen();
  });

  it('does not submit until a six digit code is entered', async () => {
    await renderMfaScreen();

    expect(screen.getByText('Continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '12345');
    expect(screen.getByText('Continue')).toBeDisabled();
    expect(mockedCompleteMfaChallenge).not.toHaveBeenCalled();
  });

  it('auto-submits once six digits are entered', async () => {
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    await renderMfaScreen();

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenCalledWith('mfa-token', '123456');
  });

  it('allows retrying an MFA challenge after an invalid code', async () => {
    mockedCompleteMfaChallenge
      .mockRejectedValueOnce(new Error('Invalid MFA code.'))
      .mockResolvedValueOnce();

    await renderMfaScreen();

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '000000');

    await waitFor(() => {
      expect(screen.getByText('Invalid MFA code.')).toBeOnTheScreen();
    });

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenNthCalledWith(1, 'mfa-token', '000000');
    expect(mockedCompleteMfaChallenge).toHaveBeenNthCalledWith(2, 'mfa-token', '123456');
  });

  it('routes to the preserved redirect after completing MFA', async () => {
    setPendingMfaLogin({ status: 'mfa_required', mfaToken: 'mfa-token', redirectTo: '/account' });
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    await renderMfaScreen();

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/account');
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('does not read MFA tokens from route params', async () => {
    mockPendingMfaLogin = undefined;
    mockedUseLocalSearchParams.mockReturnValue({ token: 'route-token' });

    await renderMfaScreen();

    // No challenge, no code field: a calm explanation and a way back, not
    // six error-bordered cells before any input.
    expect(screen.getByText(SESSION_ENDED_PATTERN)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Authentication code')).toBeNull();
    expect(screen.queryByText('Continue')).toBeNull();
    expect(mockedCompleteMfaChallenge).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Sign in again'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('shows no error styling before a submit fails', async () => {
    await renderMfaScreen();

    expect(screen.queryByText(ERROR_COPY_PATTERN)).toBeNull();
  });

  it('signs in with a recovery code', async () => {
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    await renderMfaScreen();

    await fireEvent.press(screen.getByText('Use a recovery code'));
    await fireEvent.changeText(screen.getByLabelText('Recovery code'), 'ABCDE-FGHIJ');
    await fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenCalledWith('mfa-token', 'ABCDE-FGHIJ');
  });
});
