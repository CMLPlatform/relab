import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import ResetPasswordScreen from '@/app/(auth)/reset-password';
import { apiFetch } from '@/services/api/client';
import { renderWithProviders } from '@/test-utils/index';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

const AT_LEAST_8_PATTERN = /at least 8/i;
const PASSWORD_RESET_SUCCESS_PATTERN = /Password reset successful/i;
const REDIRECTING_TO_LOGIN_PATTERN = /Redirecting to login/i;

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockPush = jest.fn();

function createMockResponse(ok: boolean, body: Record<string, unknown> = {}): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function renderResetPasswordScreen() {
  renderWithProviders(<ResetPasswordScreen />);
}

async function settleForm() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function submitResetPassword(password: string) {
  fireEvent.changeText(screen.getByTestId('password-input'), password);
  await settleForm();
  expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getAllByTestId('button')[0]);
  await settleForm();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockedApiFetch.mockResolvedValue(createMockResponse(true));
  (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-reset-token' });
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
  });
});

describe('ResetPasswordScreen rendering', () => {
  it('renders the reset password form', () => {
    renderResetPasswordScreen();
    expect(screen.getAllByText('Reset Password')).not.toHaveLength(0);
    expect(screen.getByTestId('password-input')).toBeOnTheScreen();
    expect(screen.getByText('Back to Login')).toBeOnTheScreen();
  });

  it('removes the token from browser history on web', () => {
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
    jest.replaceProperty(Platform, 'OS', 'web');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/reset-password' },
    });

    renderResetPasswordScreen();

    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/reset-password');

    replaceStateSpy.mockRestore();
  });

  it('shows a validation error for a short password', async () => {
    renderResetPasswordScreen();

    fireEvent.changeText(screen.getByTestId('password-input'), 'short');
    await settleForm();

    expect(screen.getByText(AT_LEAST_8_PATTERN)).toBeOnTheScreen();
  });
});

describe('ResetPasswordScreen submission', () => {
  it('shows an error when no reset token is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});

    renderResetPasswordScreen();
    await submitResetPassword('strongpass99');

    expect(screen.getByText('No reset token provided')).toBeOnTheScreen();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('submits the new password and shows the success state', async () => {
    renderResetPasswordScreen();
    await submitResetPassword('strongpass99');

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/reset-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: 'valid-reset-token',
          password: 'strongpass99',
        }),
      }),
    );
    expect(screen.getByText(PASSWORD_RESET_SUCCESS_PATTERN)).toBeOnTheScreen();
    expect(screen.getByText(REDIRECTING_TO_LOGIN_PATTERN)).toBeOnTheScreen();
  });

  it('shows the API error message when the reset fails', async () => {
    mockedApiFetch.mockResolvedValue(createMockResponse(false, { detail: 'Reset token expired' }));

    renderResetPasswordScreen();
    await submitResetPassword('strongpass99');

    expect(screen.getByText('Reset token expired')).toBeOnTheScreen();
  });

  it('shows a generic error when the reset request throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    renderResetPasswordScreen();
    await submitResetPassword('strongpass99');

    expect(screen.getByText('An error occurred during password reset')).toBeOnTheScreen();

    consoleErrorSpy.mockRestore();
  });
});

describe('ResetPasswordScreen navigation', () => {
  it('navigates to login from the button and after success delay', async () => {
    renderResetPasswordScreen();

    fireEvent.press(screen.getAllByTestId('button')[1]);
    expect(mockPush).toHaveBeenCalledWith('/login');

    await submitResetPassword('strongpass99');
    await screen.findByText(PASSWORD_RESET_SUCCESS_PATTERN);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
