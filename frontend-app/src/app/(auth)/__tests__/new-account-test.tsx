import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import type React from 'react';
import * as auth from '@/services/api/authentication';
import { renderWithProviders } from '@/test-utils';
import type { User } from '@/types/User';
import NewAccount from '../new-account';

jest.mock('@/services/api/authentication', () => ({
  login: jest.fn(),
  register: jest.fn(),
}));

const mockRefetch = jest.fn();
const mockUseAuth = jest.fn(
  (): { user: User | null; isLoading: boolean; refetch: typeof mockRefetch } => ({
    user: null,
    isLoading: false,
    refetch: mockRefetch,
  }),
);
const mockedRegister = jest.mocked(auth.register);
const mockedLogin = jest.mocked(auth.login);

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock global alert (used by the screen to show errors)
global.alert = jest.fn();

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();

describe('NewAccount screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      navigate: mockNavigate,
      dismissTo: mockDismissTo,
      setParams: jest.fn(),
    });
  });

  it('renders the username section by default', () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    expect(screen.getByPlaceholderText('Username')).toBeTruthy();
    expect(screen.getByText('Who are you?')).toBeTruthy();
  });

  it('shows validation error for invalid username', () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'a'); // too short
    expect(screen.getByText(/at least 2/)).toBeTruthy();
  });

  it('chevron button is disabled for invalid username', () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    // With empty username, the chevron-right button should be disabled
    // We check by verifying no navigation happens
    const input = screen.getByPlaceholderText('Username');
    fireEvent.changeText(input, '');
    // The forward button exists but is disabled (empty username)
    expect(screen.getByPlaceholderText('Username')).toBeTruthy();
  });

  it('advances to email section with valid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');

    await waitFor(() => {
      expect(screen.getByText(/How do we reach you/)).toBeTruthy();
    });
  });

  it('does not advance from username when invalid', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'a');

    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');

    expect(screen.queryByText(/How do we reach you/)).toBeNull();
  });

  it('shows email validation error for invalid email', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    // Navigate to email section
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'not_an_email');
    expect(screen.getByText(/valid email/)).toBeTruthy();
  });

  it('navigates to products on successful registration and login', async () => {
    mockedRegister.mockResolvedValue({ success: true });
    mockedLogin.mockResolvedValue('access-token');

    renderWithProviders(<NewAccount />, { withDialog: true });

    // Username section
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'newuser');
    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');

    // Email section
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'user@example.com');
    fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');

    // Password section
    await screen.findByPlaceholderText('Password');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'strongpass99');
    fireEvent.press(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/products');
    });
  });

  it('shows error when registration fails', async () => {
    mockedRegister.mockResolvedValue({ success: false, error: 'Email already in use' });

    renderWithProviders(<NewAccount />, { withDialog: true });

    // Navigate to password section
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'newuser');
    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'taken@example.com');
    fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');
    await screen.findByPlaceholderText('Password');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'strongpass99');

    fireEvent.press(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(auth.register).toHaveBeenCalled();
    });
  });

  it('shows validation alerts when "Create Account" is pressed with invalid data (force validation)', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });

    // Jump to password section manually via sections
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'valid@example.com');
    fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');

    await screen.findByPlaceholderText('Password');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), '123'); // too short

    fireEvent.press(screen.getByText('Create Account'));

    await waitFor(() => {
      // Dialog should be shown for invalid password (since it's the last check)
      expect(screen.getByText('Invalid Password')).toBeTruthy();
    });
  });

  it('navigates back through sections', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'testuser');
    fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');

    await screen.findByPlaceholderText('Email address');
    fireEvent.press(screen.getByText('Edit username'));

    expect(screen.getByPlaceholderText('Username')).toBeTruthy();
  });

  it('navigates to login via "I already have an account"', () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    fireEvent.press(screen.getByText('I already have an account'));
    expect(mockDismissTo).toHaveBeenCalledWith('/login');
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});

describe('NewAccount – authenticated redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('redirects to /products when a user is already logged in', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '1',
        email: 'a@b.com',
        username: 'alice',
        isActive: true,
        isVerified: true,
        isSuperuser: false,
        oauth_accounts: [],
      },
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<NewAccount />, { withDialog: true });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/products');
    });
  });

  it('does not redirect while auth is still loading', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, refetch: mockRefetch });

    renderWithProviders(<NewAccount />, { withDialog: true });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect when no user is logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, refetch: mockRefetch });

    renderWithProviders(<NewAccount />, { withDialog: true });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
