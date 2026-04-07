import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { WebBrowserResultType } from 'expo-web-browser';
import { HttpResponse, http } from 'msw';
import * as auth from '@/services/api/authentication';
import { mockPlatform, mockUser, renderWithProviders, restorePlatform, server } from '@/test-utils';
import Login from '../login';

jest.mock('@/services/api/authentication', () => ({
  login: jest.fn(),
  getUser: jest.fn(),
  getToken: jest.fn(),
  hasWebSessionFlag: jest.fn().mockReturnValue(false),
  markWebSessionActive: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: {
    CANCEL: 'cancel',
    DISMISS: 'dismiss',
    OPENED: 'opened',
    LOCKED: 'locked',
  },
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('exp://localhost/login'),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockedLogin = jest.mocked(auth.login);
const mockedGetUser = jest.mocked(auth.getUser);
const mockedGetToken = jest.mocked(auth.getToken);
const mockedMarkWebSessionActive = jest.mocked(auth.markWebSessionActive);
const mockedOpenAuthSessionAsync = jest.mocked(WebBrowser.openAuthSessionAsync);
type AuthSessionResult = Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;

describe('Login screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
    mockedGetToken.mockResolvedValue(undefined); // default: guest
    mockedGetUser.mockResolvedValue(undefined);
    mockedOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' } as AuthSessionResult);
    restorePlatform();
  });

  afterEach(() => {
    restorePlatform();
  });

  it('renders login form elements', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Login', {}, { timeout: 3000 });
    expect(screen.getByPlaceholderText('Email or username')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Password')).toBeOnTheScreen();
  });

  it('shows Login button', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await waitFor(
      () => {
        expect(screen.getByText('Login')).toBeOnTheScreen();
      },
      { timeout: 3000 },
    );
  });

  it('redirects to products when already authenticated on mount', async () => {
    mockedGetToken.mockResolvedValue('dummy-token');
    mockedGetUser.mockResolvedValue(
      mockUser({ username: 'existing_user', email: 'e@example.com' }),
    );
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({ pathname: '/products' }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('redirects to onboarding when user has no username', async () => {
    mockedGetToken.mockResolvedValue('dummy-token');
    mockedGetUser.mockResolvedValue(
      mockUser({ username: 'Username not defined', email: 'e@example.com', isVerified: false }),
    );
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding');
    });
  });

  it('calls login and redirects to products on successful login', async () => {
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(mockUser()); // returned by getUser(true) inside attemptLogin

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByPlaceholderText('Email or username');

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(auth.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('redirects to the requested route after successful login', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ redirectTo: '/profile' });
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(mockUser());

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByPlaceholderText('Email or username');

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/profile');
    });
  });

  it('shows Login Failed dialog when login returns null', async () => {
    mockedLogin.mockResolvedValue(undefined);

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByPlaceholderText('Email or username');

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'bad@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
    });
  });

  it('shows Login Failed dialog on login exception', async () => {
    mockedLogin.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByPlaceholderText('Email or username');

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 't@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
    });
  });

  it('navigates to forgot password on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Forgot password?');
    fireEvent.press(screen.getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
  });

  it('navigates to new account on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Create a new account');
    fireEvent.press(screen.getByText('Create a new account'));
    expect(mockPush).toHaveBeenCalledWith('/new-account');
  });

  it('on web, GitHub OAuth redirects the page instead of opening a popup', async () => {
    mockPlatform('web');
    const authUrl = 'https://github.com/login/oauth/authorize?client_id=test-client';
    server.use(
      http.get(/\/auth\/oauth\/github\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: authUrl }),
      ),
    );

    // Intercept window.location.href so jsdom doesn't attempt real navigation
    let capturedHref = '';
    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return capturedHref;
        },
        set href(v: string) {
          capturedHref = v;
        },
      },
    });

    try {
      renderWithProviders(<Login />, { withDialog: true, withAuth: true });
      await screen.findByText('Continue with GitHub');
      fireEvent.press(screen.getByText('Continue with GitHub'));

      await waitFor(() => {
        expect(capturedHref).toBe(authUrl);
        expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      });
    } finally {
      if (originalLocationDescriptor) {
        Object.defineProperty(window, 'location', originalLocationDescriptor);
      }
    }
  });

  it('hydrates a web OAuth callback returned by page redirect params', async () => {
    mockPlatform('web');
    (useLocalSearchParams as jest.Mock).mockReturnValue({ success: 'true' });
    mockedGetUser.mockResolvedValueOnce(
      mockUser({ username: 'oauth_user', email: 'oauth@example.com' }),
    );

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });

    await waitFor(() => {
      expect(mockedMarkWebSessionActive).toHaveBeenCalled();
      expect(auth.getUser).toHaveBeenCalledWith(true);
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('shows error when OAuth provider denies access via web page redirect', async () => {
    mockPlatform('web');
    (useLocalSearchParams as jest.Mock).mockReturnValue({ error: 'access_denied' });

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
      expect(screen.getByText(/You denied access/i)).toBeOnTheScreen();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('shows explicit account-linking guidance when OAuth account already exists', async () => {
    mockPlatform('web');
    server.use(
      http.get(/\/auth\/oauth\/github\/session\/authorize.*/, () =>
        HttpResponse.json({ detail: 'OAUTH_USER_ALREADY_EXISTS' }, { status: 400 }),
      ),
    );

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with GitHub');
    fireEvent.press(screen.getByText('Continue with GitHub'));

    await waitFor(() => {
      expect(screen.getByText('Email Already Registered')).toBeOnTheScreen();
      expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    });
  });

  it('shows error when OAuth provider denies access', async () => {
    mockPlatform('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?error=access_denied',
    });

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
      expect(screen.getByText(/You denied access/i)).toBeOnTheScreen();
    });
  });

  it('shows platform-specific retry guidance on native OAuth failure', async () => {
    mockPlatform('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      // No known error code or detail; falls through to platform-specific guidance
      url: 'exp://localhost/login?success=false',
    });

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
      // Native platform should show device/internet guidance
      expect(screen.getByText(/ensure your device has internet/i)).toBeOnTheScreen();
    });
  });

  it('retries session validation after OAuth success', async () => {
    mockPlatform('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    mockedGetUser
      .mockRejectedValueOnce(new Error('Network error')) // first getUser attempt fails
      .mockResolvedValueOnce(mockUser({ username: 'oauth_user', email: 'oauth@example.com' }))
      .mockResolvedValueOnce(mockUser({ username: 'oauth_user', email: 'oauth@example.com' })); // refetch(false)

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({ pathname: '/products' }),
        );
      },
      { timeout: 2000 },
    );
  });

  it('shows error when OAuth succeeds but session validation fails after max retries', async () => {
    mockPlatform('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    mockedGetUser.mockRejectedValue(new Error('Session validation failed')); // all retry attempts fail

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(
      () => {
        expect(screen.getByText('Login Failed')).toBeOnTheScreen();
        expect(screen.getByText(/couldn't establish your session/i)).toBeOnTheScreen();
      },
      { timeout: 3000 },
    );
  });

  it('shows account suspended message when OAuth succeeds but user is inactive', async () => {
    mockPlatform('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    mockedGetUser
      .mockResolvedValueOnce(undefined) // initial mount
      .mockResolvedValueOnce(
        mockUser({ username: 'suspended_user', email: 'suspended@example.com', isActive: false }),
      );

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Account Suspended')).toBeOnTheScreen();
      expect(screen.getByText(/your account has been suspended/i)).toBeOnTheScreen();
    });
  });

  it('navigates back to browsing on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Browse');
    fireEvent.press(screen.getByText('Browse'));
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('shows forgot password link and create account button', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await waitFor(() => {
      expect(screen.getByText('Forgot password?')).toBeOnTheScreen();
      expect(screen.getByText('Create a new account')).toBeOnTheScreen();
    });
  });

  it('shows account suspended message in attemptLogin when user is inactive', async () => {
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(mockUser({ isActive: false }));

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByPlaceholderText('Email or username');
    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'suspended@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByText('Account Suspended')).toBeOnTheScreen();
    });
  });

  it('shows error when OAuth setup fails (auth endpoint unreachable)', async () => {
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ detail: 'Endpoint not found' }, { status: 404 }),
      ),
    );

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
      expect(screen.getByText('Endpoint not found')).toBeOnTheScreen();
    });
  });

  it('handles user cancellation during OAuth browser session', async () => {
    mockPlatform('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({
      type: WebBrowserResultType.CANCEL,
    });

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled();
      // Should not show error or navigate
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('shows dialog when getUser returns null after successful login', async () => {
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(undefined); // getUser returns undefined

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByPlaceholderText('Email or username');

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 't@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
      expect(screen.getByText(/Unable to retrieve user information/)).toBeOnTheScreen();
    });
  });

  it('shows error when OAuth provider returns an unsafe authorization URL on web', async () => {
    mockPlatform('web');
    server.use(
      http.get(/\/auth\/oauth\/github\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'http://evil.example.com/phish' }),
      ),
    );

    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with GitHub');
    fireEvent.press(screen.getByText('Continue with GitHub'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeOnTheScreen();
      expect(screen.getByText(/Unexpected authorization URL/)).toBeOnTheScreen();
    });
  });

  it('initiates GitHub OAuth login', async () => {
    renderWithProviders(<Login />, { withDialog: true, withAuth: true });
    await screen.findByText('Continue with GitHub');
    fireEvent.press(screen.getByText('Continue with GitHub'));
    // MSW will catch the request
    await waitFor(() => {
      expect(screen.queryByText('Login Failed')).toBeNull();
    });
  });
});
