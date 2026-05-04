import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openAuthSessionAsync, WebBrowserResultType } from 'expo-web-browser';
import Login from '@/app/(auth)/login';
import { getToken, getUser, login, markWebSessionActive } from '@/services/api/authentication';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  openOAuthBrowserSession,
} from '@/services/api/oauthFlow';
import { mockPlatform, mockUser, renderWithProviders, restorePlatform } from '@/test-utils/index';

const mockDialogApi = {
  alert: jest.fn(),
  input: jest.fn(),
  toast: jest.fn(),
};
const mockAuthRefetch = jest.fn<() => Promise<void>>();

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: () => 'light',
}));

jest.mock('@/components/auth/LoginSections', () => {
  const React = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');
  const { Controller } = require('react-hook-form');

  return {
    LoginLayout: ({ children, onBrowse }: { children: React.ReactNode; onBrowse: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: onBrowse },
          React.createElement(Text, null, 'Browse'),
        ),
        children,
      ),
    LoginBrandHero: () => React.createElement(Text, null, 'Login'),
    LoginDivider: () => React.createElement(View, { testID: 'login-divider' }),
    LoginFormSection: ({
      control,
      emailRef,
      onSubmit,
      onForgotPassword,
    }: {
      control: unknown;
      emailRef: { current: { focus: () => void } | null };
      onSubmit: () => void;
      onForgotPassword: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Controller, {
          control,
          name: 'email',
          render: ({ field }: { field: { value: string; onChange: (value: string) => void } }) =>
            React.createElement(TextInput, {
              placeholder: 'Email or username',
              ref: (instance: { focus?: () => void } | null) => {
                if (instance?.focus) {
                  emailRef.current = { focus: () => instance.focus?.() };
                }
              },
              value: field.value,
              onChangeText: field.onChange,
            }),
        }),
        React.createElement(Controller, {
          control,
          name: 'password',
          render: ({ field }: { field: { value: string; onChange: (value: string) => void } }) =>
            React.createElement(TextInput, {
              placeholder: 'Password',
              secureTextEntry: true,
              value: field.value,
              onChangeText: field.onChange,
            }),
        }),
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: onSubmit },
          React.createElement(Text, null, 'Login'),
        ),
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: onForgotPassword },
          React.createElement(Text, null, 'Forgot password?'),
        ),
      ),
    LoginOAuthSection: ({ onGoogle, onGithub }: { onGoogle: () => void; onGithub: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: onGoogle },
          React.createElement(Text, null, 'Continue with Google'),
        ),
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: onGithub },
          React.createElement(Text, null, 'Continue with GitHub'),
        ),
      ),
    LoginSecondaryAction: ({ onCreateAccount }: { onCreateAccount: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: 'button', onPress: onCreateAccount },
        React.createElement(Text, null, 'Create a new account'),
      ),
  };
});

jest.mock('@/services/api/authentication', () => ({
  login: jest.fn(),
  getUser: jest.fn(),
  getToken: jest.fn(),
  hasWebSessionFlag: jest.fn().mockReturnValue(false),
  markWebSessionActive: jest.fn(),
}));

jest.mock('@/services/api/oauthFlow', () => ({
  ...jest.requireActual<typeof import('@/services/api/oauthFlow')>('@/services/api/oauthFlow'),
  buildOAuthAuthorizeUrl: jest.fn(),
  fetchOAuthAuthorizationUrl: jest.fn(),
  openOAuthBrowserSession: jest.fn(),
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

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
  );
  return {
    ...actual,
    useDialog: jest.fn(() => mockDialogApi),
  };
});

const mockReplace = jest.fn();
const mockPush = jest.fn();
const YOU_DENIED_ACCESS_PATTERN = /You denied access/i;
const ALREADY_EXISTS_PATTERN = /already exists/i;
const ENSURE_DEVICE_INTERNET_PATTERN = /ensure your device has internet/i;
const ACCOUNT_SUSPENDED_PATTERN = /your account has been suspended/i;
const UNABLE_TO_RETRIEVE_USER_PATTERN = /Unable to retrieve user information/;
const UNEXPECTED_AUTHORIZATION_URL_PATTERN = /Unexpected authorization URL/;
const UNEXPECTED_CALLBACK_URL_PATTERN = /Unexpected OAuth callback URL/;

const mockedLogin = jest.mocked(login);
const mockedGetUser = jest.mocked(getUser);
const mockedGetToken = jest.mocked(getToken);
const mockedMarkWebSessionActive = jest.mocked(markWebSessionActive);
const mockedOpenAuthSessionAsync = jest.mocked(openAuthSessionAsync);
const mockedBuildOAuthAuthorizeUrl = jest.mocked(buildOAuthAuthorizeUrl);
const mockedFetchOAuthAuthorizationUrl = jest.mocked(fetchOAuthAuthorizationUrl);
const mockedOpenOAuthBrowserSession = jest.mocked(openOAuthBrowserSession);
type AuthSessionResult = Awaited<ReturnType<typeof openAuthSessionAsync>>;

describe('Login screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDialogApi.alert.mockReset();
    mockDialogApi.input.mockReset();
    mockDialogApi.toast.mockReset();
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
    mockedBuildOAuthAuthorizeUrl.mockReturnValue('https://api.example.com/oauth/authorize');
    mockedFetchOAuthAuthorizationUrl.mockResolvedValue({
      ok: true,
      status: 200,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      detail: undefined,
    });
    mockedOpenOAuthBrowserSession.mockResolvedValue({ type: 'cancel' } as AuthSessionResult);
    const { useAuth } = require('@/context/auth.ts');
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
      refetch: mockAuthRefetch,
    });
    mockAuthRefetch.mockResolvedValue(undefined);
    restorePlatform();
  });

  afterEach(() => {
    restorePlatform();
  });

  it('renders login form elements', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    expect(screen.getAllByText('Login').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Email or username')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Password')).toBeOnTheScreen();
  });

  it('shows Login button', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    expect(screen.getByRole('button', { name: 'Login' })).toBeOnTheScreen();
  });

  it('redirects to products when already authenticated on mount', async () => {
    const { useAuth } = require('@/context/auth.ts');
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser({ username: 'existing_user', email: 'e@example.com' }),
      isLoading: false,
      refetch: mockAuthRefetch,
    });
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({ pathname: '/products' }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('redirects already-authenticated users without a username to onboarding', async () => {
    const { useAuth } = require('@/context/auth.ts');
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser({ username: null, email: 'oauth@example.com' }),
      isLoading: false,
      refetch: mockAuthRefetch,
    });
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('calls login and redirects to products on successful login', async () => {
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(mockUser()); // returned by getUser(true) inside attemptLogin

    renderWithProviders(<Login />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'test@example.com');
    fireEvent.changeText(
      screen.getByPlaceholderText('Password'),
      'correct-horse-battery-staple-v42',
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('test@example.com', 'correct-horse-battery-staple-v42');
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('redirects to the requested route after successful login', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ redirectTo: '/profile' });
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(mockUser());

    renderWithProviders(<Login />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'test@example.com');
    fireEvent.changeText(
      screen.getByPlaceholderText('Password'),
      'correct-horse-battery-staple-v42',
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/profile');
    });
  });

  it('routes successful login without username to onboarding before requested redirect', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ redirectTo: '/profile' });
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValueOnce(mockUser({ username: null }));

    renderWithProviders(<Login />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'test@example.com');
    fireEvent.changeText(
      screen.getByPlaceholderText('Password'),
      'correct-horse-battery-staple-v42',
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
      expect(mockReplace).not.toHaveBeenCalledWith('/profile');
    });
  });

  it('shows Login Failed dialog when login returns null', async () => {
    mockedLogin.mockResolvedValue(undefined);

    renderWithProviders(<Login />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'bad@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrongpass');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: 'Invalid email or password.',
        }),
      );
    });
  });

  it('shows Login Failed dialog on login exception', async () => {
    mockedLogin.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<Login />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 't@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: 'Network error',
        }),
      );
    });
  });

  it('navigates to forgot password on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Forgot password?');
    fireEvent.press(screen.getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
  });

  it('navigates to new account on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await screen.findByText('Create a new account');
    fireEvent.press(screen.getByText('Create a new account'));
    expect(mockPush).toHaveBeenCalledWith('/new-account');
  });

  it('on web, GitHub OAuth redirects the page instead of opening a popup', async () => {
    mockPlatform('web');
    const authUrl = 'https://github.com/login/oauth/authorize?client_id=test-client';
    mockedFetchOAuthAuthorizationUrl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      authorizationUrl: authUrl,
      detail: undefined,
    });

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
      renderWithProviders(<Login />, { withDialog: true });
      await act(async () => {
        fireEvent.press(screen.getByText('Continue with GitHub'));
      });

      await waitFor(() => {
        expect(capturedHref).toBe(authUrl);
        expect(openAuthSessionAsync).not.toHaveBeenCalled();
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

    renderWithProviders(<Login />, { withDialog: true });

    await waitFor(() => {
      expect(mockedMarkWebSessionActive).toHaveBeenCalled();
      expect(getUser).toHaveBeenCalledWith(true);
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('routes OAuth callback without username to onboarding', async () => {
    mockPlatform('web');
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      success: 'true',
      redirectTo: '/profile',
    });
    mockedGetUser.mockResolvedValueOnce(mockUser({ username: null, email: 'oauth@example.com' }));

    renderWithProviders(<Login />, { withDialog: true });

    await waitFor(() => {
      expect(mockedMarkWebSessionActive).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
      expect(mockReplace).not.toHaveBeenCalledWith('/profile');
    });
  });

  it('shows error when OAuth provider denies access via web page redirect', async () => {
    mockPlatform('web');
    (useLocalSearchParams as jest.Mock).mockReturnValue({ error: 'access_denied' });

    renderWithProviders(<Login />, { withDialog: true });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(YOU_DENIED_ACCESS_PATTERN),
        }),
      );
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('shows explicit account-linking guidance when OAuth account already exists', async () => {
    mockPlatform('web');
    mockedFetchOAuthAuthorizationUrl.mockResolvedValueOnce({
      ok: false,
      status: 400,
      authorizationUrl: undefined,
      detail: 'OAUTH_USER_ALREADY_EXISTS',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with GitHub'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Email Already Registered',
          message: expect.stringMatching(ALREADY_EXISTS_PATTERN),
        }),
      );
      expect(openAuthSessionAsync).not.toHaveBeenCalled();
    });
  });

  it('shows error when OAuth provider denies access', async () => {
    mockPlatform('android');
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?error=access_denied',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(YOU_DENIED_ACCESS_PATTERN),
        }),
      );
    });
  });

  it('shows platform-specific retry guidance on native OAuth failure', async () => {
    mockPlatform('android');
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: 'success',
      // No known error code or detail; falls through to platform-specific guidance
      url: 'exp://localhost/login?success=false',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(ENSURE_DEVICE_INTERNET_PATTERN),
        }),
      );
    });
  });

  it('retries session validation after OAuth success', async () => {
    mockPlatform('android');
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    mockedGetUser
      .mockRejectedValueOnce(new Error('Network error')) // first getUser attempt fails
      .mockResolvedValueOnce(mockUser({ username: 'oauth_user', email: 'oauth@example.com' }));

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({ pathname: '/products' }),
        );
      },
      { timeout: 2000 },
    );
  });

  it('shows account suspended message when OAuth succeeds but user is inactive', async () => {
    mockPlatform('android');
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://localhost/login?success=true',
    });
    mockedGetUser.mockResolvedValue(
      mockUser({ username: 'suspended_user', email: 'suspended@example.com', isActive: false }),
    );

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Account Suspended',
          message: expect.stringMatching(ACCOUNT_SUSPENDED_PATTERN),
        }),
      );
    });
  });

  it('navigates back to browsing on button press', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    fireEvent.press(screen.getByText('Browse'));
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('shows forgot password link and create account button', async () => {
    renderWithProviders(<Login />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText('Forgot password?')).toBeOnTheScreen();
      expect(screen.getByText('Create a new account')).toBeOnTheScreen();
    });
  });

  it('shows account suspended message in attemptLogin when user is inactive', async () => {
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValue(mockUser({ isActive: false }));

    renderWithProviders(<Login />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 'suspended@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Account Suspended',
          message: expect.stringMatching(ACCOUNT_SUSPENDED_PATTERN),
        }),
      );
    });
  });

  it('shows error when OAuth setup fails (auth endpoint unreachable)', async () => {
    mockedFetchOAuthAuthorizationUrl.mockResolvedValueOnce({
      ok: false,
      status: 404,
      authorizationUrl: undefined,
      detail: 'Endpoint not found',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: 'Endpoint not found',
        }),
      );
    });
  });

  it('handles user cancellation during OAuth browser session', async () => {
    mockPlatform('android');
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: WebBrowserResultType.CANCEL,
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => {
      expect(openOAuthBrowserSession).toHaveBeenCalled();
      // Should not show error or navigate
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('shows dialog when getUser returns null after successful login', async () => {
    mockedLogin.mockResolvedValue('access-token');
    mockedGetUser.mockResolvedValue(undefined);

    renderWithProviders(<Login />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Email or username'), 't@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'pass');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(UNABLE_TO_RETRIEVE_USER_PATTERN),
        }),
      );
    });
  });

  it('shows error when OAuth provider returns an unsafe authorization URL on web', async () => {
    mockPlatform('web');
    mockedFetchOAuthAuthorizationUrl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      authorizationUrl: 'http://evil.example.com/phish',
      detail: undefined,
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with GitHub'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(UNEXPECTED_AUTHORIZATION_URL_PATTERN),
        }),
      );
    });
  });

  it('shows error when OAuth provider returns an unsafe authorization URL on native', async () => {
    mockPlatform('android');
    mockedFetchOAuthAuthorizationUrl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      authorizationUrl: 'http://evil.example.com/phish',
      detail: undefined,
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with GitHub'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(UNEXPECTED_AUTHORIZATION_URL_PATTERN),
        }),
      );
      expect(openOAuthBrowserSession).not.toHaveBeenCalled();
    });
  });

  it('shows error when native OAuth callback does not match the configured redirect', async () => {
    mockPlatform('android');
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: 'success',
      url: 'exp://evil.example/login?success=true',
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => {
      expect(mockDialogApi.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
          message: expect.stringMatching(UNEXPECTED_CALLBACK_URL_PATTERN),
        }),
      );
      expect(getUser).not.toHaveBeenCalled();
    });
  });

  it('initiates GitHub OAuth login', async () => {
    mockedOpenOAuthBrowserSession.mockResolvedValueOnce({
      type: WebBrowserResultType.CANCEL,
    });

    renderWithProviders(<Login />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue with GitHub'));
    });

    await waitFor(() => {
      expect(openOAuthBrowserSession).toHaveBeenCalled();
      expect(mockDialogApi.alert).not.toHaveBeenCalled();
    });
  });
});
