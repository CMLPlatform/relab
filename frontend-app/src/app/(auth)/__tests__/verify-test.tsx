import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HttpResponse, http } from 'msw';
import { API_URL } from '@/config';
import { getToken, getUser } from '@/services/api/authentication';
import { renderWithProviders } from '@/test-utils/index';
import { server } from '@/test-utils/server';
import VerifyEmailScreen from '../verify';

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
  getUser: jest.fn(),
  hasWebSessionFlag: jest.fn().mockReturnValue(false),
}));

const NO_VERIFICATION_TOKEN_PATTERN = /No verification token/;
const EMAIL_VERIFIED_SUCCESS_PATTERN = /Email verified successfully/;
const GENERIC_VERIFY_ERROR_PATTERN = /An error occurred/;
const mockedGetToken = jest.mocked(getToken);
const mockedGetUser = jest.mocked(getUser);

function renderVerifyEmailScreen() {
  renderWithProviders(<VerifyEmailScreen />, { withAuth: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetToken.mockResolvedValue(undefined);
  mockedGetUser.mockResolvedValue(undefined);
  (useRouter as jest.Mock).mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
  });
});

describe('VerifyEmailScreen states', () => {
  it('shows error when no token is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: undefined });
    renderVerifyEmailScreen();
    await waitFor(
      () => {
        expect(screen.getByText(NO_VERIFICATION_TOKEN_PATTERN)).toBeOnTheScreen();
      },
      { timeout: 3000 },
    );
  });

  it('shows loading indicator on mount when token is present', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    // Delay the response so the loading text stays visible long enough for waitFor to catch it.
    server.use(
      http.post(`${API_URL}/auth/verify`, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderVerifyEmailScreen();
    await waitFor(() => {
      expect(screen.getByText('Verifying your email...')).toBeOnTheScreen();
    });
  });

  it('shows success message when verification succeeds', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    server.use(http.post(`${API_URL}/auth/verify`, () => HttpResponse.json({}, { status: 200 })));
    renderVerifyEmailScreen();
    await waitFor(() => {
      expect(screen.getByText(EMAIL_VERIFIED_SUCCESS_PATTERN)).toBeOnTheScreen();
    });
  });

  it('shows API error when verification returns non-ok response', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'bad-token' });
    server.use(
      http.post(`${API_URL}/auth/verify`, () =>
        HttpResponse.json({ detail: 'Token expired' }, { status: 400 }),
      ),
    );
    renderVerifyEmailScreen();
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeOnTheScreen();
    });
  });

  it('shows error when fetch throws', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-token' });
    server.use(http.post(`${API_URL}/auth/verify`, () => HttpResponse.error()));
    renderVerifyEmailScreen();
    await waitFor(() => {
      expect(screen.getByText(GENERIC_VERIFY_ERROR_PATTERN)).toBeOnTheScreen();
    });
  });
});

describe('VerifyEmailScreen navigation', () => {
  it('Back to Home button calls router.replace on error', async () => {
    const mockReplace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: undefined });
    renderVerifyEmailScreen();
    await waitFor(() => {
      expect(screen.getByText('Back to Home')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByText('Back to Home'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
