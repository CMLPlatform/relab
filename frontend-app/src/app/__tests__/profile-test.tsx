import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import * as auth from '@/services/api/authentication';
import * as fetching from '@/services/api/fetching';
import { mockUser, renderWithProviders, server } from '@/test-utils';
import type { User } from '@/types/User';
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

jest.mock('@/services/api/fetching', () => ({
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
const mockedApiFetch = jest.mocked(fetching.apiFetch);
const mockedCreateURL = jest.mocked(Linking.createURL);
const mockedOpenAuthSessionAsync = jest.mocked(WebBrowser.openAuthSessionAsync);

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

describe('Profile screen newsletter preference', () => {
  beforeEach(() => {
    mockedGetToken.mockResolvedValue('token');
    mockedGetUser.mockResolvedValue({
      ...mockUser,
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

    renderWithProviders(<Profile />, { withAuth: true });

    expect(await screen.findByText('You are subscribed.', {}, { timeout: 10000 })).toBeTruthy();
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

    renderWithProviders(<Profile />, { withAuth: true });

    await waitFor(() => {
      expect(screen.getByText('You are not subscribed.')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('newsletter-switch'), 'valueChange', true);

    expect(await screen.findByText('You are subscribed.', {}, { timeout: 10000 })).toBeTruthy();
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

    renderWithProviders(<Profile />, { withAuth: true });

    await waitFor(() => {
      expect(screen.getByText('You are not subscribed.')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('newsletter-switch'), 'valueChange', true);

    expect(
      await screen.findByText('Unable to save right now.', {}, { timeout: 10000 }),
    ).toBeTruthy();
  });

  it('shows an error and retry action when newsletter preferences fail to load', async () => {
    server.use(
      http.get(`${API_URL}/newsletter/me`, () =>
        HttpResponse.json({ detail: 'Could not load right now.' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Profile />, { withAuth: true });

    expect(
      await screen.findByText('Could not load right now.', {}, { timeout: 10000 }),
    ).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('Profile screen actions', () => {
  beforeEach(() => {
    mockedGetToken.mockResolvedValue('token');
    mockedGetUser.mockResolvedValue({
      ...mockUser,
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

    renderWithProviders(<Profile />, { withAuth: true });

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

    renderWithProviders(<Profile />, { withAuth: true });

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

    renderWithProviders(<Profile />, { withAuth: true });

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
    renderWithProviders(<Profile />, { withAuth: true });

    const logoutBtn = await screen.findByText('Logout');
    fireEvent.press(logoutBtn);

    expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
  });

  it('opens the OAuth link flow for Google accounts', async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authorization_url: 'https://example.com/auth' }),
    } as never);
    mockedOpenAuthSessionAsync.mockResolvedValue({ type: 'success' } as never);
    mockedGetUser.mockResolvedValue({
      ...mockUser,
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      oauth_accounts: [],
    });

    renderWithProviders(<Profile />, { withAuth: true });

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
    renderWithProviders(<Profile />, { withAuth: true });

    const deleteBtn = await screen.findByText('Delete Account?');
    fireEvent.press(deleteBtn);

    expect(screen.getByText('Delete Account')).toBeTruthy();
    expect(
      screen.getByText(
        'To delete your account and all associated data, please send an email request to:',
      ),
    ).toBeTruthy();
  });
});
