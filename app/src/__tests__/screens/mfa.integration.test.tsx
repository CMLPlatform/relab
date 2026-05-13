import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MfaScreen from '@/app/(auth)/mfa';
import { getUser } from '@/services/api/authentication';
import { completeMfaChallenge, setPendingMfaLogin } from '@/services/api/authMfa';
import { mockUser, renderWithProviders } from '@/test-utils/index';

let mockPendingMfaLogin:
  | { status: 'mfa_required'; mfaToken: string; redirectTo?: string }
  | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/services/api/authMfa', () => ({
  clearPendingMfaLogin: jest.fn(() => {
    mockPendingMfaLogin = undefined;
  }),
  completeMfaChallenge: jest.fn(),
  getPendingMfaLogin: jest.fn(() => mockPendingMfaLogin),
  setPendingMfaLogin: jest.fn((pending) => {
    mockPendingMfaLogin = pending as typeof mockPendingMfaLogin;
  }),
}));

jest.mock('@/services/api/authentication', () => ({
  getUser: jest.fn(),
}));

const mockReplace = jest.fn();
const mockedUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedCompleteMfaChallenge = completeMfaChallenge as jest.MockedFunction<
  typeof completeMfaChallenge
>;
const mockedGetUser = getUser as jest.MockedFunction<typeof getUser>;

function renderMfaScreen() {
  renderWithProviders(<MfaScreen />);
}

beforeEach(() => {
  mockPendingMfaLogin = undefined;
  jest.clearAllMocks();
  mockedUseRouter.mockReturnValue({ replace: mockReplace });
  mockedUseLocalSearchParams.mockReturnValue({});
  mockedGetUser.mockResolvedValue(mockUser());
  setPendingMfaLogin({ status: 'mfa_required', mfaToken: 'mfa-token' });
});

describe('MfaScreen challenge flow', () => {
  it('keeps submit disabled until a six digit code is present', () => {
    renderMfaScreen();

    expect(screen.getByText('Continue')).toBeDisabled();
    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '12345');
    expect(screen.getByText('Continue')).toBeDisabled();
    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    expect(screen.getByText('Continue')).not.toBeDisabled();
  });

  it('allows retrying an MFA challenge after an invalid code', async () => {
    mockedCompleteMfaChallenge
      .mockRejectedValueOnce(new Error('Invalid MFA code.'))
      .mockResolvedValueOnce();

    renderMfaScreen();

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '000000');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByText('Invalid MFA code.')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
    expect(mockedCompleteMfaChallenge).toHaveBeenNthCalledWith(1, 'mfa-token', '000000');
    expect(mockedCompleteMfaChallenge).toHaveBeenNthCalledWith(2, 'mfa-token', '123456');
  });

  it('routes to the preserved redirect after completing MFA', async () => {
    setPendingMfaLogin({ status: 'mfa_required', mfaToken: 'mfa-token', redirectTo: '/profile' });
    mockedCompleteMfaChallenge.mockResolvedValueOnce();

    renderMfaScreen();

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/profile');
    });
    expect(mockedGetUser).toHaveBeenCalledWith(true);
  });

  it('does not read MFA tokens from route params', () => {
    mockPendingMfaLogin = undefined;
    mockedUseLocalSearchParams.mockReturnValue({ token: 'route-token' });

    renderMfaScreen();

    expect(screen.getByText('MFA session expired. Please log in again.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    expect(screen.getByText('Continue')).toBeDisabled();
  });
});
