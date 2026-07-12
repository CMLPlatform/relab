import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MfaScreen from '@/app/(auth)/mfa';
import { useAuth } from '@/context/auth';
import { completeMfaChallenge, setPendingMfaLogin } from '@/services/api/auth/authMfa';
import { mockUser, renderWithProviders } from '@/test-utils/index';
import type { User } from '@/types/User';

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

function renderMfaScreen() {
  renderWithProviders(<MfaScreen />);
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
  it('does not submit until a six digit code is entered', () => {
    renderMfaScreen();

    expect(screen.getByText('Continue')).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '12345');
    expect(screen.getByText('Continue')).toBeDisabled();
    expect(mockedCompleteMfaChallenge).not.toHaveBeenCalled();
  });

  it('auto-submits once six digits are entered', async () => {
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    renderMfaScreen();

    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenCalledWith('mfa-token', '123456');
  });

  it('allows retrying an MFA challenge after an invalid code', async () => {
    mockedCompleteMfaChallenge
      .mockRejectedValueOnce(new Error('Invalid MFA code.'))
      .mockResolvedValueOnce();

    renderMfaScreen();

    fireEvent.changeText(screen.getByLabelText('6-digit code'), '000000');

    await waitFor(() => {
      expect(screen.getByText('Invalid MFA code.')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenNthCalledWith(1, 'mfa-token', '000000');
    expect(mockedCompleteMfaChallenge).toHaveBeenNthCalledWith(2, 'mfa-token', '123456');
  });

  it('routes to the preserved redirect after completing MFA', async () => {
    setPendingMfaLogin({ status: 'mfa_required', mfaToken: 'mfa-token', redirectTo: '/account' });
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    renderMfaScreen();

    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/account');
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('does not read MFA tokens from route params', () => {
    mockPendingMfaLogin = undefined;
    mockedUseLocalSearchParams.mockReturnValue({ token: 'route-token' });

    renderMfaScreen();

    expect(screen.getByText('MFA session expired. Please sign in again.')).toBeOnTheScreen();
    expect(screen.getByText('Continue')).toBeDisabled();
    expect(mockedCompleteMfaChallenge).not.toHaveBeenCalled();
  });

  it('signs in with a recovery code', async () => {
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    renderMfaScreen();

    fireEvent.press(screen.getByText('Use a recovery code'));
    fireEvent.changeText(screen.getByLabelText('Recovery code'), 'ABCDE-FGHIJ');
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenCalledWith('mfa-token', 'ABCDE-FGHIJ');
  });
});
