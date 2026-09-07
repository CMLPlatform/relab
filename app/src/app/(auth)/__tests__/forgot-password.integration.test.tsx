import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import { apiFetch } from '@/services/api/client';
import { renderWithProviders } from '@/test-utils/index';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

const FORGOT_PASSWORD_INSTRUCTIONS_PATTERN = /send you instructions to reset your password/i;
const VALID_EMAIL_PATTERN = /valid email/i;
const ACCOUNT_EXISTS_MESSAGE_PATTERN = /If an account exists with this email/i;
const TRY_AGAIN_LATER_PATTERN = /Try again later/i;

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

function createMockResponse(ok: boolean, body: Record<string, unknown> = {}): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function renderForgotPasswordScreen() {
  renderWithProviders(<ForgotPasswordScreen />);
}

async function submitForgotPasswordEmail(email: string) {
  fireEvent.changeText(screen.getByLabelText('Email'), email);
  await waitFor(() => {
    expect(screen.getByText('Send reset link')).not.toBeDisabled();
  });
  fireEvent.press(screen.getByText('Send reset link'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue(createMockResponse(true));
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    setParams: jest.fn(),
  });
});

describe('ForgotPasswordScreen rendering', () => {
  it('renders the forgot password form', () => {
    renderForgotPasswordScreen();
    expect(screen.getByText('Forgot password')).toBeOnTheScreen();
    expect(screen.getAllByText('Send reset link')).not.toHaveLength(0);
    expect(screen.getByText(FORGOT_PASSWORD_INSTRUCTIONS_PATTERN)).toBeOnTheScreen();
  });

  it('shows a validation error for an invalid email address', async () => {
    renderForgotPasswordScreen();
    fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');

    await waitFor(() => {
      expect(screen.getByText(VALID_EMAIL_PATTERN)).toBeOnTheScreen();
    });
  });
});

describe('ForgotPasswordScreen submission', () => {
  it('submits the email and shows the success state', async () => {
    renderForgotPasswordScreen();
    await submitForgotPasswordEmail('user@example.com');

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@example.com' }),
        }),
      );
      expect(screen.getByText(ACCOUNT_EXISTS_MESSAGE_PATTERN)).toBeOnTheScreen();
    });
  });

  it('shows the API error message when the request fails', async () => {
    mockedApiFetch.mockResolvedValue(createMockResponse(false, { detail: 'No matching account' }));

    renderForgotPasswordScreen();
    await submitForgotPasswordEmail('user@example.com');

    await waitFor(() => {
      expect(screen.getByText('No matching account')).toBeOnTheScreen();
    });
  });

  it('shows a generic error when the request throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    renderForgotPasswordScreen();
    await submitForgotPasswordEmail('user@example.com');

    await waitFor(() => {
      expect(screen.getByText(TRY_AGAIN_LATER_PATTERN)).toBeOnTheScreen();
    });

    consoleErrorSpy.mockRestore();
  });
});

describe('ForgotPasswordScreen navigation', () => {
  it('redirects to login after a successful request delay', async () => {
    renderForgotPasswordScreen();
    await submitForgotPasswordEmail('user@example.com');

    await screen.findByText(ACCOUNT_EXISTS_MESSAGE_PATTERN);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('navigates to login from both states (not history back, which may be invalid)', async () => {
    renderForgotPasswordScreen();

    fireEvent.press(screen.getByText('Back to login'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockBack).not.toHaveBeenCalled();

    await submitForgotPasswordEmail('user@example.com');
    await screen.findByText(ACCOUNT_EXISTS_MESSAGE_PATTERN);

    fireEvent.press(screen.getByText('Back to login'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
