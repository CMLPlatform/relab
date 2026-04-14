import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as client from '@/services/api/client';
import { renderWithProviders } from '@/test-utils';
import ResetPasswordScreen from '../reset-password';

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = client.apiFetch as jest.MockedFunction<typeof client.apiFetch>;

function createMockResponse(ok: boolean, body: Record<string, unknown> = {}): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe('ResetPasswordScreen', () => {
  const mockPush = jest.fn();

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

  it('renders the reset password form', () => {
    renderWithProviders(<ResetPasswordScreen />);
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

    renderWithProviders(<ResetPasswordScreen />);

    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/reset-password');

    replaceStateSpy.mockRestore();
  });

  it('shows a validation error for a short password', async () => {
    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('password-input'), 'short');

    await waitFor(() => {
      expect(screen.getByText(/at least 8/i)).toBeOnTheScreen();
    });
  });

  it('shows an error when no reset token is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});

    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('password-input'), 'strongpass99');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
      expect(screen.getByText('No reset token provided')).toBeOnTheScreen();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('submits the new password and shows the success state', async () => {
    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('password-input'), 'strongpass99');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
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
      expect(screen.getByText(/Password reset successful/i)).toBeOnTheScreen();
      expect(screen.getByText(/Redirecting to login/i)).toBeOnTheScreen();
    });
  });

  it('shows the API error message when the reset fails', async () => {
    mockedApiFetch.mockResolvedValue(createMockResponse(false, { detail: 'Reset token expired' }));

    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('password-input'), 'strongpass99');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
      expect(screen.getByText('Reset token expired')).toBeOnTheScreen();
    });
  });

  it('shows a generic error when the reset request throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('password-input'), 'strongpass99');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
      expect(screen.getByText('An error occurred during password reset')).toBeOnTheScreen();
    });

    consoleErrorSpy.mockRestore();
  });

  it('navigates to login from the button and after success delay', async () => {
    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.press(screen.getAllByTestId('button')[1]);
    expect(mockPush).toHaveBeenCalledWith('/login');

    fireEvent.changeText(screen.getByTestId('password-input'), 'strongpass99');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);
    await screen.findByText(/Password reset successful/i);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
