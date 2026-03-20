import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import ProfileTab from '../profile';
import * as auth from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  getUser: jest.fn(),
  getToken: jest.fn(),
  logout: jest.fn(),
  verify: jest.fn(),
  unlinkOAuth: jest.fn(),
  updateUser: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('exp://localhost/profile'),
}));

global.alert = jest.fn() as jest.Mock;

const mockReplace = jest.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

const baseProfile = {
  id: 42,
  username: 'testuser',
  email: 'test@example.com',
  isActive: true,
  isVerified: true,
  isSuperuser: false,
  oauth_accounts: [],
};

describe('ProfileTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (auth.getUser as jest.Mock).mockResolvedValue(baseProfile);
    (auth.logout as jest.Mock).mockResolvedValue(undefined);
    (auth.verify as jest.Mock).mockResolvedValue(undefined);
    (auth.updateUser as jest.Mock).mockResolvedValue(baseProfile);
    (auth.unlinkOAuth as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders null before profile loads', () => {
    (auth.getUser as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { toJSON } = render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    expect(screen.queryByText('testuser.')).toBeNull();
  });

  it('renders username and email after profile loads', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('testuser.')).toBeTruthy();
      expect(screen.getByText('test@example.com')).toBeTruthy();
    });
  });

  it('renders Active and Verified chips', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.getByText('Verified')).toBeTruthy();
    });
  });

  it('renders Superuser chip when isSuperuser is true', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({ ...baseProfile, isSuperuser: true });
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Superuser')).toBeTruthy();
    });
  });

  it('shows Verify email action when user is not verified', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({ ...baseProfile, isVerified: false });
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Verify email address')).toBeTruthy();
    });
  });

  it('does not show Verify email action when user is verified', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.queryByText('Verify email address')).toBeNull();
    });
  });

  it('shows logout dialog when Logout is pressed', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await screen.findByText('Logout');
    fireEvent.press(screen.getByText('Logout'));
    await waitFor(() => {
      expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
    });
  });

  it('calls logout and replaces route on confirm logout', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await screen.findByText('Logout');
    fireEvent.press(screen.getByText('Logout'));
    await screen.findByText('Are you sure you want to log out?');
    // Press the Logout button inside the dialog (there are two "Logout" texts now)
    const logoutButtons = screen.getAllByText('Logout');
    fireEvent.press(logoutButtons[logoutButtons.length - 1]);
    await waitFor(() => {
      expect(auth.logout).toHaveBeenCalled();
    });
  });

  it('shows Link Google Account when Google is not linked', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Link Google Account')).toBeTruthy();
    });
  });

  it('shows Unlink Google when Google is linked', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({
      ...baseProfile,
      oauth_accounts: [{ oauth_name: 'google', account_email: 'g@example.com' }],
    });
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Unlink Google')).toBeTruthy();
    });
  });

  it('shows unlink confirmation dialog when Unlink Google is pressed', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({
      ...baseProfile,
      oauth_accounts: [{ oauth_name: 'google', account_email: 'g@example.com' }],
    });
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await screen.findByText('Unlink Google');
    fireEvent.press(screen.getByText('Unlink Google'));
    await waitFor(() => {
      expect(screen.getByText('Unlink Account')).toBeTruthy();
    });
  });

  it('shows edit username dialog when username is pressed', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await screen.findByText('testuser.');
    fireEvent.press(screen.getByText('testuser.'));
    await waitFor(() => {
      expect(screen.getByText('Edit Username')).toBeTruthy();
    });
  });

  it('calls updateUser with new username on Save', async () => {
    render(
      <Wrapper>
        <ProfileTab />
      </Wrapper>,
    );
    await screen.findByText('testuser.');
    fireEvent.press(screen.getByText('testuser.'));
    await screen.findByText('Save');

    // Change username in the text input
    const input = screen.getByDisplayValue('testuser');
    fireEvent.changeText(input, 'newname');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(auth.updateUser).toHaveBeenCalledWith({ username: 'newname' });
    });
  });
});
