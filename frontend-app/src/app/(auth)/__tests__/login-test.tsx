import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { http, HttpResponse } from 'msw';
import { Platform } from 'react-native';
import Login from '../login';
import { renderWithProviders, server } from '@/test-utils';
import * as auth from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  login: jest.fn(),
  getUser: jest.fn(),
  getToken: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('exp://localhost/login'),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const originalPlatformOS = Platform.OS;

function setPlatformOS(os: string): void {
  Object.defineProperty(Platform, 'OS', {
    value: os,
    configurable: true,
  });
}

describe('Login screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (auth.getUser as jest.Mock).mockResolvedValue(null);
    setPlatformOS(originalPlatformOS);
  });

  afterEach(() => {
    setPlatformOS(originalPlatformOS);
  });

  it('renders login form elements', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Email address')).toBeTruthy();
      expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    });
  });

  it('shows Login button', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeTruthy();
    });
  });

  it('redirects to products when already authenticated on mount', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({
      id: 1,
      username: 'existinguser',
      email: 'e@example.com',
      isActive: true,
      isVerified: true,
      isSuperuser: false,
    });
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('redirects to onboarding when user has no username', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({
      id: 1,
      username: 'Username not defined',
      email: 'e@example.com',
      isActive: true,
      isVerified: false,
      isSuperuser: false,
    });
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding');
    });
  });

  it('calls login and redirects to products on successful login', async () => {
    (auth.login as jest.Mock).mockResolvedValue('access-token');
    (auth.getUser as jest.Mock)
      .mockResolvedValueOnce(null) // initial check — not authenticated
      .mockResolvedValueOnce({
        id: 1,
        username: 'testuser',
        email: 't@example.com',
        isActive: true,
        isVerified: true,
        isSuperuser: false,
      }); // after login

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByPlaceholderText('Email address');

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(auth.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('shows Login Failed dialog when login returns null', async () => {
    (auth.login as jest.Mock).mockResolvedValue(null);

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByPlaceholderText('Email address');

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'bad@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeTruthy();
    });
  });

  it('shows Login Failed dialog on login exception', async () => {
    (auth.login as jest.Mock).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByPlaceholderText('Email address');

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 't@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    fireEvent.press(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeTruthy();
    });
  });

  it('navigates to forgot password on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Forgot Password?');
    fireEvent.press(screen.getByText('Forgot Password?'));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
  });

  it('navigates to new account on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Create a new account');
    fireEvent.press(screen.getByText('Create a new account'));
    expect(mockPush).toHaveBeenCalledWith('/new-account');
  });

  it('completes web OAuth login via cookie-session success and does not store URL token', async () => {
    setPlatformOS('web');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth/authorize' }),
      ),
    );
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true&access_token=leaky-token',
    });
    (auth.getUser as jest.Mock)
      .mockResolvedValueOnce(null) // initial mount check
      .mockResolvedValueOnce({
        id: 1,
        username: 'oauthuser',
        email: 'oauth@example.com',
        isActive: true,
        isVerified: true,
        isSuperuser: false,
      });

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  it('shows explicit account-linking guidance when OAuth account already exists', async () => {
    setPlatformOS('web');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ detail: 'OAUTH_USER_ALREADY_EXISTS' }, { status: 400 }),
      ),
    );

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Account Not Linked')).toBeTruthy();
      expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    });
  });

  it('shows error when OAuth provider denies access', async () => {
    setPlatformOS('web');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?error=access_denied',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeTruthy();
      expect(screen.getByText(/You denied access/i)).toBeTruthy();
    });
  });

  it('shows platform-specific retry guidance on native OAuth failure', async () => {
    setPlatformOS('android');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      // No known error code or detail — falls through to platform-specific guidance
      url: 'exp://localhost/login?success=false',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeTruthy();
      // Native platform should show device/internet guidance
      expect(screen.getByText(/ensure your device has internet/i)).toBeTruthy();
    });
  });

  it('retries session validation after OAuth success', async () => {
    setPlatformOS('web');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    (auth.getUser as jest.Mock)
      .mockResolvedValueOnce(null) // initial mount check
      .mockRejectedValueOnce(new Error('Network error')) // first getUser retry attempt
      .mockResolvedValueOnce({
        id: 1,
        username: 'oauthuser',
        email: 'oauth@example.com',
        isActive: true,
        isVerified: true,
        isSuperuser: false,
      }); // second getUser retry succeeds

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      // Should retry and eventually succeed (called 3 times: initial, 1st retry fail, 2nd retry succeed)
      expect(auth.getUser).toHaveBeenCalledTimes(3);
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('shows error when OAuth succeeds but session validation fails after max retries', async () => {
    setPlatformOS('web');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    (auth.getUser as jest.Mock)
      .mockResolvedValueOnce(null) // initial mount
      .mockRejectedValue(new Error('Session validation failed')); // all retry attempts fail

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Login Failed')).toBeTruthy();
      expect(screen.getByText(/couldn't establish your session/i)).toBeTruthy();
    });
  });

  it('shows account suspended message when OAuth succeeds but user is inactive', async () => {
    setPlatformOS('web');
    server.use(
      http.get(/\/auth\/oauth\/google\/session\/authorize.*/, () =>
        HttpResponse.json({ authorization_url: 'https://provider.example.com/oauth' }),
      ),
    );
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    (auth.getUser as jest.Mock)
      .mockResolvedValueOnce(null) // initial mount
      .mockResolvedValueOnce({
        id: 1,
        username: 'suspendeduser',
        email: 'suspended@example.com',
        isActive: false,
        isVerified: true,
        isSuperuser: false,
      });

    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Continue with Google');
    fireEvent.press(screen.getByText('Continue with Google'));

    await waitFor(() => {
      expect(screen.getByText('Account Suspended')).toBeTruthy();
      expect(screen.getByText(/your account has been suspended/i)).toBeTruthy();
    });
  });
});
