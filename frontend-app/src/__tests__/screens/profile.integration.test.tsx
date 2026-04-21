import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createURL } from 'expo-linking';
import { openAuthSessionAsync } from 'expo-web-browser';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import Profile from '@/app/profile';
import { getToken, getUser, unlinkOAuth } from '@/services/api/authentication';
import { mockUser, renderWithProviders, server } from '@/test-utils/index';
import type { User } from '@/types/User';

jest.mock('@/services/api/authentication', () => {
  const actual = jest.requireActual<typeof import('@/services/api/authentication')>(
    '@/services/api/authentication',
  );
  return {
    ...actual,
    getToken: jest.fn(),
    getUser: jest.fn(),
    unlinkOAuth: jest.fn(actual.unlinkOAuth),
    updateUser: jest.fn(actual.updateUser),
    verify: jest.fn(actual.verify),
  };
});

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'myapp://profile'),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
  })),
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockedGetToken = jest.mocked(getToken);
const mockedGetUser = jest.mocked(getUser);
const mockedCreateURL = jest.mocked(createURL);
const mockedOpenAuthSessionAsync = jest.mocked(openAuthSessionAsync);

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: newsletter integration coverage shares one mock server/auth fixture.
describe('Profile screen newsletter preference', () => {
  beforeEach(() => {
    mockedGetToken.mockResolvedValue('token');
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      oauth_accounts: [],
    });
  });

  it('shows the current subscription state', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({
          email: 'test@example.com',
          subscribed: true,
          is_confirmed: true,
        }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(await screen.findByText('You are subscribed.')).toBeOnTheScreen();
  });

  it('updates the preference when the switch is toggled', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({
          email: 'test@example.com',
          subscribed: false,
          is_confirmed: false,
        }),
      ),
      http.put(`${API_URL}/newsletter/me`, async ({ request }) => {
        const body = (await request.json()) as { subscribed: boolean };
        return HttpResponse.json({
          email: 'test@example.com',
          subscribed: body.subscribed,
          is_confirmed: body.subscribed,
        });
      }),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(await screen.findByText('You are not subscribed.')).toBeOnTheScreen();

    fireEvent(screen.getByTestId('newsletter-switch'), 'valueChange', true);

    expect(await screen.findByText('You are subscribed.')).toBeOnTheScreen();
  });

  it('shows an error when updating the preference fails', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({
          email: 'test@example.com',
          subscribed: false,
          is_confirmed: false,
        }),
      ),
      http.put(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Unable to save right now.' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(await screen.findByText('You are not subscribed.')).toBeOnTheScreen();

    fireEvent(screen.getByTestId('newsletter-switch'), 'valueChange', true);

    expect(await screen.findByText('Unable to save right now.')).toBeOnTheScreen();
  });

  it('shows an error and retry action when newsletter preferences fail to load', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Could not load right now.' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(await screen.findByText('Could not load right now.')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('retries loading newsletter preference when the retry button is pressed', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Temporary failure' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(await screen.findByText('Temporary failure')).toBeOnTheScreen();

    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({
          email: 'test@example.com',
          subscribed: true,
          is_confirmed: true,
        }),
      ),
    );

    fireEvent.press(screen.getByText('Try again'));

    expect(await screen.findByText('You are subscribed.')).toBeOnTheScreen();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: profile action integration coverage intentionally shares one authenticated harness.
describe('Profile screen actions', () => {
  jest.setTimeout(10_000);

  beforeEach(() => {
    mockedGetToken.mockResolvedValue('token');
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      isVerified: false,
      oauth_accounts: [
        { oauth_name: 'google', account_id: 'google-1', account_email: 'google@test.com' },
      ],
    } satisfies User);
  });

  it('allows editing the username through a dialog', async () => {
    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const usernameText = await screen.findByText('testuser.');
    fireEvent.press(usernameText);

    const input = screen.getByDisplayValue('testuser');
    fireEvent.changeText(input, 'newname');

    const saveBtn = screen.getByText('Save');
    fireEvent.press(saveBtn);

    await waitFor(() => {
      expect(screen.queryByText('Edit Username')).not.toBeOnTheScreen();
    });
  });

  it('triggers verification email resend', async () => {
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const verifyBtn = await screen.findByText('Verify email address');
    fireEvent.press(verifyBtn);
    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Verification email sent'));
    });
  });

  it('handles unlinking OAuth accounts', async () => {
    const mockedUnlink = jest.mocked(unlinkOAuth);
    mockedUnlink.mockResolvedValue(true);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const unlinkBtn = await screen.findByText('Unlink Google');
    fireEvent.press(unlinkBtn);

    const confirmBtn = await screen.findByText('Unlink');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockedUnlink).toHaveBeenCalledWith('google');
    });
  });

  it('triggers logout check', async () => {
    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const logoutBtn = await screen.findByText('Logout');
    fireEvent.press(logoutBtn);

    expect(await screen.findByText('Are you sure you want to log out?')).toBeOnTheScreen();
  });

  it('opens the OAuth link flow for Google accounts', async () => {
    server.use(
      http.get(`${API_URL}/auth/oauth/google/associate/authorize`, () =>
        HttpResponse.json({ authorization_url: 'https://example.com/auth' }),
      ),
    );
    mockedCreateURL.mockReturnValue('myapp://profile');
    mockedOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'myapp://profile',
    } as never);
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      isVerified: false,
      oauth_accounts: [],
    } satisfies User);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const connectBtn = await screen.findByText('Link Google Account');
    fireEvent.press(connectBtn);

    await waitFor(() => {
      expect(mockedOpenAuthSessionAsync).toHaveBeenCalledWith(
        'https://example.com/auth',
        'myapp://profile',
      );
    });
  });

  it('opens the delete-account dialog', async () => {
    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const deleteBtn = await screen.findByText('Delete Account?');
    fireEvent.press(deleteBtn);

    expect(await screen.findByText('Delete Account')).toBeOnTheScreen();
  });

  it('alerts when username is too short', async () => {
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const usernameText = await screen.findByText('testuser.');
    fireEvent.press(usernameText);

    const input = screen.getByDisplayValue('testuser');
    fireEvent.changeText(input, 'ab');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalled();
    });
  });

  it('alerts on username update failure', async () => {
    server.use(
      http.patch(`${API_URL}/users/me`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const usernameText = await screen.findByText('testuser.');
    fireEvent.press(usernameText);
    fireEvent.changeText(screen.getByDisplayValue('testuser'), 'newname');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalled();
    });
  });

  it('alerts on verification email failure', async () => {
    server.use(
      http.post(`${API_URL}/auth/request-verify-token`, () =>
        HttpResponse.json({ detail: 'Failed' }, { status: 500 }),
      ),
    );
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const verifyBtn = await screen.findByText('Verify email address');
    fireEvent.press(verifyBtn);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalled();
    });
  });

  it('alerts on OAuth unlink failure', async () => {
    const mockedUnlink = jest.mocked(unlinkOAuth);
    mockedUnlink.mockRejectedValueOnce(new Error('Cannot disconnect'));
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const unlinkBtn = await screen.findByText('Unlink Google');
    fireEvent.press(unlinkBtn);
    fireEvent.press(await screen.findByText('Unlink'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalled();
    });
  });

  it('alerts when OAuth link flow fails', async () => {
    server.use(
      http.get(`${API_URL}/auth/oauth/google/associate/authorize`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    global.alert = jest.fn();
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      isVerified: false,
      oauth_accounts: [],
    } satisfies User);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const connectBtn = await screen.findByText('Link Google Account');
    fireEvent.press(connectBtn);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalled();
    });
  });

  it('handles unlinking GitHub accounts', async () => {
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      isVerified: false,
      oauth_accounts: [
        { oauth_name: 'github', account_id: 'github-1', account_email: 'gh@test.com' },
      ],
    } satisfies User);

    const mockedUnlink = jest.mocked(unlinkOAuth);
    mockedUnlink.mockResolvedValue(true);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const unlinkBtn = await screen.findByText('Unlink GitHub');
    fireEvent.press(unlinkBtn);
    fireEvent.press(await screen.findByText('Unlink'));

    await waitFor(() => {
      expect(mockedUnlink).toHaveBeenCalledWith('github');
    });
  });

  it('opens the OAuth link flow for GitHub accounts', async () => {
    server.use(
      http.get(`${API_URL}/auth/oauth/github/associate/authorize`, () =>
        HttpResponse.json({ authorization_url: 'https://github.com/auth' }),
      ),
    );
    mockedCreateURL.mockReturnValue('myapp://profile');
    mockedOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'myapp://profile',
    } as never);

    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      isVerified: false,
      oauth_accounts: [
        { oauth_name: 'google', account_id: 'google-1', account_email: 'google@test.com' },
      ],
    } satisfies User);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const connectBtn = await screen.findByText('Link GitHub Account');
    fireEvent.press(connectBtn);

    await waitFor(() => {
      expect(mockedOpenAuthSessionAsync).toHaveBeenCalledWith(
        'https://github.com/auth',
        'myapp://profile',
      );
    });
  });
});
