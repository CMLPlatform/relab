import * as auth from '@/services/api/authentication';
import * as client from '@/services/api/client';
import { mockUser, renderWithProviders, server } from '@/test-utils';
import type { User } from '@/types/User';
import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import Profile from '../profile';

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
  getUser: jest.fn(),
  hasWebSessionFlag: jest.fn().mockReturnValue(true),
  markWebSessionActive: jest.fn(),
  logout: jest.fn(),
  unlinkOAuth: jest.fn(),
  updateUser: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

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
const mockedApiFetch = jest.mocked(client.apiFetch);
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

    expect(
      await screen.findByText('You are subscribed.', {}, { timeout: 10000 }),
    ).toBeOnTheScreen();
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

    await waitFor(() => {
      expect(screen.getByText('You are not subscribed.')).toBeOnTheScreen();
    });

    fireEvent(screen.getByTestId('newsletter-switch'), 'valueChange', true);

    expect(
      await screen.findByText('You are subscribed.', {}, { timeout: 10000 }),
    ).toBeOnTheScreen();
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

    await waitFor(() => {
      expect(screen.getByText('You are not subscribed.')).toBeOnTheScreen();
    });

    fireEvent(screen.getByTestId('newsletter-switch'), 'valueChange', true);

    expect(
      await screen.findByText('Unable to save right now.', {}, { timeout: 10000 }),
    ).toBeOnTheScreen();
  });

  it('shows an error and retry action when newsletter preferences fail to load', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Could not load right now.' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(
      await screen.findByText('Could not load right now.', {}, { timeout: 10000 }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('retries loading newsletter preference when the retry button is pressed', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Temporary failure' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    expect(await screen.findByText('Temporary failure', {}, { timeout: 10000 })).toBeOnTheScreen();

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

    expect(
      await screen.findByText('You are subscribed.', {}, { timeout: 10000 }),
    ).toBeOnTheScreen();
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
    const mockedUpdateUser = jest.mocked(auth.updateUser);
    mockedUpdateUser.mockResolvedValue(undefined);

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

    await waitFor(() => {
      expect(mockedUpdateUser).toHaveBeenCalledWith({ username: 'newname' });
    });
  });

  it('triggers verification email resend', async () => {
    const mockedVerify = jest.mocked(auth.verify);
    mockedVerify.mockResolvedValue(true);
    global.alert = jest.fn();

    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const verifyBtn = await screen.findByText('Verify email address');
    fireEvent.press(verifyBtn);

    await waitFor(() => {
      expect(mockedVerify).toHaveBeenCalledWith('test@example.com');
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
    });
  });

  it('triggers logout check', async () => {
    renderWithProviders(<Profile />, { withAuth: true, withThemeMode: true });

    const logoutBtn = await screen.findByText('Logout');
    fireEvent.press(logoutBtn);

    expect(screen.getByText('Are you sure you want to log out?')).toBeOnTheScreen();
  });

  it('opens the OAuth link flow for Google accounts', async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authorization_url: 'https://example.com/auth' }),
    } as never);
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
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/oauth/google/associate/authorize'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
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
    const mockedUpdateUser = jest.mocked(auth.updateUser);
    mockedUpdateUser.mockRejectedValueOnce(new Error('Server error'));
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
    const mockedVerify = jest.mocked(auth.verify);
    mockedVerify.mockRejectedValueOnce(new Error('Failed'));
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
    mockedApiFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as never);
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
    });
  });

  it('opens the OAuth link flow for GitHub accounts', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authorization_url: 'https://github.com/auth' }),
    } as never);
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
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/oauth/github/associate/authorize'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
      expect(mockedOpenAuthSessionAsync).toHaveBeenCalledWith(
        'https://github.com/auth',
        'myapp://profile',
      );
      expect(mockedGetUser.mock.calls.length).toBeGreaterThan(initialGetUserCalls);
    });
  });
});
