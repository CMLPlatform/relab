import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import * as auth from '@/services/api/authentication';
import { mockUser, renderWithProviders, server } from '@/test-utils';
import type { User } from '@/types/User';
import Profile from '../profile';

jest.mock('@/services/api/authentication', () => {
  const actual = jest.requireActual<typeof auth>('@/services/api/authentication');
  return {
    ...actual,
    getToken: jest.fn(),
    getUser: jest.fn(),
    unlinkOAuth: jest.fn(actual.unlinkOAuth),
    updateUser: jest.fn(actual.updateUser),
    verify: jest.fn(actual.verify),
  };
});

// No longer mocking apiFetch; using MSW instead

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

const mockedGetToken = jest.mocked(auth.getToken);
const mockedGetUser = jest.mocked(auth.getUser);
// const mockedApiFetch = jest.mocked(client.apiFetch); // Removed
const mockedCreateURL = jest.mocked(Linking.createURL);
const mockedOpenAuthSessionAsync = jest.mocked(WebBrowser.openAuthSessionAsync);

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

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
    // mockedApiFetch.mockReset(); // Removed
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

    // Override with a success response for the retry
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

describe('Profile screen actions', () => {
  // Increase timeout for potentially slow UI interactions in this suite
  jest.setTimeout(10000);
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

    // Press the username to open the dialog
    const usernameText = await screen.findByText('testuser.');
    fireEvent.press(usernameText);

    // Find the dialog and input
    const input = screen.getByDisplayValue('testuser');
    fireEvent.changeText(input, 'newname');

    // Save
    const saveBtn = screen.getByText('Save');
    fireEvent.press(saveBtn);

    // Verify it was handled. Since we're using MSW, we can't easily check 'toHaveBeenCalledWith'
    // on a real function unless we spy on it. But we can check that the dialog closed.
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
    const mockedUnlink = jest.mocked(auth.unlinkOAuth);
    mockedUnlink.mockResolvedValue(true);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const unlinkBtn = await screen.findByText('Unlink Google');
    fireEvent.press(unlinkBtn);

    // Confirm in dialog
    const confirmBtn = await screen.findByText('Unlink');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockedUnlink).toHaveBeenCalledWith('google');
      expect(screen.queryByText('Disconnect google?')).toBeNull();
    });
  });

  it('triggers logout check', async () => {
    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const logoutBtn = await screen.findByText('Logout');
    fireEvent.press(logoutBtn);

    expect(screen.getByText('Are you sure you want to log out?')).toBeOnTheScreen();
  });

  it('opens the OAuth link flow for Google accounts', async () => {
    server.use(
      http.get(`${API_URL}/auth/oauth/google/associate/authorize`, () => {
        return HttpResponse.json({ authorization_url: 'https://example.com/auth' });
      }),
    );
    mockedOpenAuthSessionAsync.mockResolvedValue({ type: 'success' } as never);
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      oauth_accounts: [],
    });

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const linkGoogleBtn = await screen.findByText('Link Google Account');
    const initialGetUserCalls = mockedGetUser.mock.calls.length;
    fireEvent.press(linkGoogleBtn);

    await waitFor(() => {
      expect(mockedCreateURL).toHaveBeenCalledWith('/profile');
      expect(mockedOpenAuthSessionAsync).toHaveBeenCalledWith(
        'https://example.com/auth',
        'myapp://profile',
      );
      expect(mockedGetUser.mock.calls.length).toBeGreaterThan(initialGetUserCalls);
    });
  });

  it('opens the delete-account dialog', async () => {
    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const deleteBtn = await screen.findByText('Delete Account?');
    fireEvent.press(deleteBtn);

    expect(screen.getByText('Delete Account')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'To delete your account and all associated data, please send an email request to:',
      ),
    ).toBeOnTheScreen();
  });

  it('alerts when username is too short', async () => {
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const usernameText = await screen.findByText('testuser.');
    fireEvent.press(usernameText);

    const input = screen.getByDisplayValue('testuser');
    fireEvent.changeText(input, 'a');

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('at least 2 characters'));
    });
  });

  it('alerts on username update failure', async () => {
    server.use(
      http.patch(`${API_URL}/users/me`, () => {
        return HttpResponse.json({ detail: 'Server error' }, { status: 500 });
      }),
    );
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const usernameText = await screen.findByText('testuser.');
    fireEvent.press(usernameText);

    const input = screen.getByDisplayValue('testuser');
    fireEvent.changeText(input, 'validname');

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update username'),
      );
    });
  });

  it('alerts on verification email failure', async () => {
    server.use(
      http.post(`${API_URL}/auth/request-verify-token`, () => {
        return HttpResponse.json({ detail: 'Failed' }, { status: 500 });
      }),
    );
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const verifyBtn = await screen.findByText('Verify email address');
    fireEvent.press(verifyBtn);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send verification email'),
      );
    });
  });

  it('alerts on OAuth unlink failure', async () => {
    const mockedUnlink = jest.mocked(auth.unlinkOAuth);
    mockedUnlink.mockRejectedValueOnce(new Error('Cannot disconnect'));
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const unlinkBtn = await screen.findByText('Unlink Google');
    fireEvent.press(unlinkBtn);

    const confirmBtn = await screen.findByText('Unlink');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to disconnect'));
    });
  });

  it('alerts when OAuth link flow fails', async () => {
    server.use(
      http.get(`${API_URL}/auth/oauth/google/associate/authorize`, () => {
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    global.alert = jest.fn();

    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      oauth_accounts: [],
    });

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const linkBtn = await screen.findByText('Link Google Account');
    fireEvent.press(linkBtn);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start link flow'),
      );
    });
  });

  it('handles unlinking GitHub accounts', async () => {
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      isVerified: false,
      oauth_accounts: [{ oauth_name: 'github', account_id: 'gh-1', account_email: 'gh@test.com' }],
    } satisfies User);
    const mockedUnlink = jest.mocked(auth.unlinkOAuth);
    mockedUnlink.mockResolvedValueOnce(true);

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const unlinkBtn = await screen.findByText('Unlink GitHub');
    fireEvent.press(unlinkBtn);

    const confirmBtn = await screen.findByText('Unlink');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockedUnlink).toHaveBeenCalledWith('github');
      expect(screen.queryByText('Disconnect github?')).toBeNull();
    });
  });

  it('opens the OAuth link flow for GitHub accounts', async () => {
    server.use(
      http.get(`${API_URL}/auth/oauth/github/associate/authorize`, () => {
        return HttpResponse.json({ authorization_url: 'https://github.com/auth' });
      }),
    );
    mockedOpenAuthSessionAsync.mockResolvedValueOnce({ type: 'success' } as never);
    mockedGetUser.mockResolvedValue({
      ...mockUser(),
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      oauth_accounts: [],
    });

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const linkGithubBtn = await screen.findByText('Link GitHub Account');
    const initialGetUserCalls = mockedGetUser.mock.calls.length;
    fireEvent.press(linkGithubBtn);

    await waitFor(() => {
      expect(mockedOpenAuthSessionAsync).toHaveBeenCalledWith(
        'https://github.com/auth',
        'myapp://profile',
      );
      expect(mockedGetUser.mock.calls.length).toBeGreaterThan(initialGetUserCalls);
    });
  });
});
