import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import * as client from '@/services/api/client';
import { renderWithProviders } from '@/test-utils';
import ForgotPasswordScreen from '../forgot-password';

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

describe('ForgotPasswordScreen', () => {
  const mockBack = jest.fn();
  const mockPush = jest.fn();
  const mockReplace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockedApiFetch.mockResolvedValue(createMockResponse(true));
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      setParams: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the forgot password form', () => {
    renderWithProviders(<ForgotPasswordScreen />);
    expect(screen.getByText('Forgot Password')).toBeOnTheScreen();
    expect(screen.getAllByText('Send Reset Link')).not.toHaveLength(0);
    expect(screen.getByText(/send you instructions to reset your password/i)).toBeOnTheScreen();
  });

  it('shows a validation error for an invalid email address', async () => {
    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'not-an-email');

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeOnTheScreen();
    });
  });

  it('submits the email and shows the success state', async () => {
    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@example.com' }),
        }),
      );
      expect(screen.getByText(/If an account exists with this email/i)).toBeOnTheScreen();
    });
  });

  it('shows the API error message when the request fails', async () => {
    mockedApiFetch.mockResolvedValue(createMockResponse(false, { detail: 'No matching account' }));

    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
      expect(screen.getByText('No matching account')).toBeOnTheScreen();
    });
  });

  it('shows a generic error when the request throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await waitFor(() => {
      expect(screen.getByText(/Please try again later/i)).toBeOnTheScreen();
    });

    consoleErrorSpy.mockRestore();
  });

  it('redirects to login after a successful request delay', async () => {
    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);

    await screen.findByText(/If an account exists with this email/i);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('allows navigating back to login from both states', async () => {
    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.press(screen.getAllByTestId('button')[1]);
    expect(mockBack).toHaveBeenCalledTimes(1);

    fireEvent.changeText(screen.getByTestId('text-input-flat'), 'user@example.com');
    await waitFor(() => {
      expect(screen.getAllByTestId('button')[0].props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getAllByTestId('button')[0]);
    await screen.findByText(/If an account exists with this email/i);

    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
