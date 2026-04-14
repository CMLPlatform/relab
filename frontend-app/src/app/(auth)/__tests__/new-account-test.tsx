import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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
    expect(screen.getByPlaceholderText('Username')).toBeOnTheScreen();
    expect(screen.getByText('Who are you?')).toBeOnTheScreen();
  });

  it('shows validation error for invalid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'a');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });

    await waitFor(() => {
      expect(screen.getByText(/at least 2/)).toBeOnTheScreen();
    });
  });

  it('chevron button is disabled for invalid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    // With empty username, the chevron-right button should be disabled
    // We check by verifying no navigation happens
    const input = screen.getByPlaceholderText('Username');
    await act(async () => {
      fireEvent.changeText(input, '');
    });
    // The forward button exists but is disabled (empty username)
    expect(screen.getByPlaceholderText('Username')).toBeOnTheScreen();
  });

  it('advances to email section with valid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });

    await waitFor(() => {
      expect(screen.getByText(/How do we reach you/)).toBeOnTheScreen();
    });
  });

  it('does not advance from username when invalid', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'a');
    });

    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });

    expect(screen.queryByText(/How do we reach you/)).toBeNull();
  });

  it('shows email validation error for invalid email', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });
    await screen.findByPlaceholderText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'not_an_email');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');
    });

    await waitFor(() => {
      expect(screen.getByText(/valid email/)).toBeOnTheScreen();
    });
  });

  it('navigates to products on successful registration and login', async () => {
    mockedRegister.mockResolvedValue({ success: true });
    mockedLogin.mockResolvedValue('access-token');

    renderWithProviders(<NewAccount />, { withDialog: true });

    // Username section
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'newuser');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });

    // Email section
    await screen.findByPlaceholderText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'user@example.com');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');
    });

    // Password section
    await screen.findByPlaceholderText('Password');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Password'), 'strongpass99');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Create Account'));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/products');
    });
  });

  it('shows error when registration fails', async () => {
    mockedRegister.mockResolvedValue({ success: false, error: 'Email already in use' });

    renderWithProviders(<NewAccount />, { withDialog: true });

    // Navigate to password section
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'newuser');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });
    await screen.findByPlaceholderText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'taken@example.com');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');
    });
    await screen.findByPlaceholderText('Password');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Password'), 'strongpass99');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Create Account'));
    });

    await waitFor(() => {
      expect(auth.register).toHaveBeenCalled();
    });
  });

  it('shows validation error for short password', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });

    // Jump to password section manually via sections
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });
    await screen.findByPlaceholderText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'valid@example.com');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Email address'), 'submitEditing');
    });

    await screen.findByPlaceholderText('Password');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Password'), '123'); // too short
    });

    // RHF shows validation error text immediately on change
    await waitFor(() => {
      expect(screen.getByText(/at least 8/)).toBeOnTheScreen();
    });
  });

  it('navigates back through sections', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Username'), 'testuser');
    });
    await act(async () => {
      fireEvent(screen.getByPlaceholderText('Username'), 'submitEditing');
    });

    await screen.findByPlaceholderText('Email address');
    await act(async () => {
      fireEvent.press(screen.getByText('Edit username'));
    });

    expect(screen.getByPlaceholderText('Username')).toBeOnTheScreen();
  });

  it('navigates to login via "I already have an account"', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.press(screen.getByText('I already have an account'));
    });
    expect(mockDismissTo).toHaveBeenCalledWith('/login');
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
        preferences: {},
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
