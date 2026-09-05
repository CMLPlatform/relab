import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import NewAccount from '@/app/(auth)/new-account';
import { login, register } from '@/services/api/auth/authentication';
import { renderWithProviders } from '@/test-utils/index';
import type { User } from '@/types/User';

const mockDialogApi = {
  alert: jest.fn(),
  input: jest.fn(),
  toast: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/services/api/auth/authentication', () => ({
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
const AT_LEAST_2_PATTERN = /at least 2/;
const HOW_DO_WE_REACH_YOU_PATTERN = /How do we reach you/;
const VALID_EMAIL_PATTERN = /valid email/;
const AT_LEAST_12_PATTERN = /at least 12/;

const mockedRegister = jest.mocked(register);
const mockedLogin = jest.mocked(login);

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/base/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
  );
  return {
    ...actual,
    useDialog: jest.fn(() => mockDialogApi),
  };
});

global.alert = jest.fn();

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();

describe('NewAccount screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDialogApi.alert.mockReset();
    mockDialogApi.input.mockReset();
    mockDialogApi.toast.mockReset();
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
    expect(screen.getByLabelText('Username')).toBeOnTheScreen();
    expect(screen.getByText('Who are you?')).toBeOnTheScreen();
  });

  it('shows validation error for invalid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'a');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });

    await waitFor(() => {
      expect(screen.getByText(AT_LEAST_2_PATTERN)).toBeOnTheScreen();
    });
  });

  it('chevron button is disabled for invalid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    const input = screen.getByLabelText('Username');
    await act(async () => {
      fireEvent.changeText(input, '');
    });
    expect(screen.getByLabelText('Username')).toBeOnTheScreen();
  });

  it('advances to email section with valid username', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'validuser');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });

    expect(screen.getByText(HOW_DO_WE_REACH_YOU_PATTERN)).toBeOnTheScreen();
  });

  it('does not advance from username when invalid', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'a');
    });

    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });

    expect(screen.queryByText(HOW_DO_WE_REACH_YOU_PATTERN)).toBeNull();
  });

  it('shows email validation error for invalid email', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'validuser');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });
    await screen.findByLabelText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address'), 'not_an_email');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Email address'), 'submitEditing');
    });

    await waitFor(() => {
      expect(screen.getByText(VALID_EMAIL_PATTERN)).toBeOnTheScreen();
    });
  });

  it('returns to login with a verify prompt after registration, without logging in', async () => {
    mockedRegister.mockResolvedValue({ success: true });
    mockedLogin.mockResolvedValue({ status: 'authenticated' });

    renderWithProviders(<NewAccount />, { withDialog: true });

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'newuser');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });

    await screen.findByLabelText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address'), 'user@example.com');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Email address'), 'submitEditing');
    });

    await screen.findByLabelText('Password');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-battery-staple-v42');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Create account'));
    });

    expect(mockedLogin).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('shows error when registration fails', async () => {
    mockedRegister.mockResolvedValue({ success: false, error: 'Email already in use' });

    renderWithProviders(<NewAccount />, { withDialog: true });

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'newuser');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });
    await screen.findByLabelText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address'), 'taken@example.com');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Email address'), 'submitEditing');
    });
    await screen.findByLabelText('Password');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-battery-staple-v42');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Create account'));
    });

    expect(register).toHaveBeenCalled();
    expect(mockDialogApi.alert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Registration failed',
        message: 'Email already in use',
      }),
    );
  });

  it('shows validation error for short password', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'validuser');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });
    await screen.findByLabelText('Email address');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address'), 'valid@example.com');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Email address'), 'submitEditing');
    });

    await screen.findByLabelText('Password');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Password'), '123');
    });

    await waitFor(() => {
      expect(screen.getByText(AT_LEAST_12_PATTERN)).toBeOnTheScreen();
    });
  });

  it('navigates back through sections', async () => {
    renderWithProviders(<NewAccount />, { withDialog: true });

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Username'), 'testuser');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Username'), 'submitEditing');
    });

    await screen.findByLabelText('Email address');
    await act(async () => {
      fireEvent.press(screen.getByText('Edit username'));
    });

    expect(screen.getByLabelText('Username')).toBeOnTheScreen();
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
        mfaEnabled: false,
        hasUsablePassword: true,
        role: 'contributor' as const,
        termsAcceptanceRequired: false,
        uploadQuota: { files: 1000, bytes: 1024 * 1024 * 1024, usedFiles: 0, usedBytes: 0 },
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
