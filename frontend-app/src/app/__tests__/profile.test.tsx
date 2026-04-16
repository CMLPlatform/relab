import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

// Variables prefixed with 'mock' can be referenced inside jest.mock() factories.
// babel-jest hoists jest.mock() calls but exempts 'mock'-prefixed variables from TDZ.
const mockRefetch = jest.fn();
const mockSetThemeMode = jest.fn();
const mockRouterReplace = jest.fn();
const mockLogout = jest.fn();
const mockUpdateUser = jest.fn();
const mockVerify = jest.fn();
const mockStopStreamMutate = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: mockRouterReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    }),
    useSegments: () => [],
    useLocalSearchParams: jest.fn().mockReturnValue({}),
    useNavigation: jest.fn().mockReturnValue({ setOptions: jest.fn() }),
    Link: ({ children }: { children: React.ReactNode }) => children,
    Redirect: () => null,
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      { Screen: () => null },
    ),
  };
});

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/useRpiIntegration', () => ({
  useRpiIntegration: () => ({ enabled: false, loading: false, setEnabled: jest.fn() }),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useStopYouTubeStreamMutation: () => ({
    mutate: (...args: unknown[]) => mockStopStreamMutate(...args),
    isPending: false,
  }),
}));

jest.mock('@/context/ThemeModeProvider', () => ({
  useThemeMode: () => ({ themeMode: 'auto', setThemeMode: mockSetThemeMode }),
  useEffectiveColorScheme: () => 'light',
}));

jest.mock('@/services/api/newsletter', () => ({
  getNewsletterPreference: jest.fn(),
  setNewsletterPreference: jest.fn(),
}));

jest.mock('@/services/api/profiles', () => ({
  getPublicProfile: jest.fn(),
}));

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn().mockResolvedValue('mock-token'),
  logout: mockLogout,
  unlinkOAuth: jest.fn().mockResolvedValue(undefined),
  updateUser: mockUpdateUser,
  verify: mockVerify,
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('relab://profile'),
  openURL: jest.fn(),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ authorization_url: 'https://oauth.example.com' }),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultUser = {
  id: 'u1',
  username: 'tester',
  email: 'test@example.com',
  isActive: true,
  isSuperuser: false,
  isVerified: false,
  oauth_accounts: [],
  preferences: { profile_visibility: 'public', theme_mode: 'auto' },
};

/** Render the profile tab and wait for all initial async effects to settle. */
async function renderProfile() {
  const ProfileTab = require('../profile').default;
  const result = render(<ProfileTab />, {
    wrapper: ({ children }) => <PaperProvider>{children}</PaperProvider>,
  });
  // Flush pending microtasks so newsletter/stats loading effects settle
  // inside act() and don't trigger "not wrapped in act" warnings.
  await act(async () => {});
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuth } = require('@/context/AuthProvider');
    (useAuth as jest.Mock).mockReturnValue({ user: defaultUser, refetch: mockRefetch });
    mockRefetch.mockResolvedValue(undefined);
    mockUpdateUser.mockResolvedValue({});
    mockVerify.mockResolvedValue(true);
    mockLogout.mockResolvedValue(undefined);
    mockStopStreamMutate.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { onSuccess?: () => void } | undefined;
      options?.onSuccess?.();
    });

    const { getNewsletterPreference, setNewsletterPreference } =
      require('@/services/api/newsletter');
    (getNewsletterPreference as jest.Mock).mockResolvedValue({ subscribed: false });
    (setNewsletterPreference as jest.Mock).mockImplementation(async (v: boolean) => ({
      subscribed: v,
    }));

    const { getPublicProfile } = require('@/services/api/profiles');
    (getPublicProfile as jest.Mock).mockResolvedValue({
      username: 'tester',
      created_at: '',
      product_count: 3,
      total_weight_kg: 1.5,
      image_count: 7,
      top_category: 'Electronics',
    });
  });

  it('renders username and email', async () => {
    const { findByText } = await renderProfile();
    expect(await findByText('tester.')).toBeTruthy();
    expect(await findByText('test@example.com')).toBeTruthy();
  });

  it('shows verify action when user is not verified', async () => {
    const { findByText } = await renderProfile();
    expect(await findByText('Verify email address')).toBeTruthy();
  });

  it('does not show verify action when user is already verified', async () => {
    const { useAuth } = require('@/context/AuthProvider');
    (useAuth as jest.Mock).mockReturnValue({
      user: { ...defaultUser, isVerified: true },
      refetch: mockRefetch,
    });
    const { queryByText } = await renderProfile();
    expect(queryByText('Verify email address')).toBeNull();
  });

  it('redirects to login when there is no authenticated user', async () => {
    const { useAuth } = require('@/context/AuthProvider');
    (useAuth as jest.Mock).mockReturnValue({ user: null, refetch: mockRefetch });

    await renderProfile();

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/login',
      params: { redirectTo: '/profile' },
    });
  });

  describe('stats section', () => {
    it('displays stats after they finish loading', async () => {
      const { findByText } = await renderProfile();
      // product_count: 3 from the mock
      expect(await findByText('3')).toBeTruthy();
    });

    it('shows loading dots while stats are fetching', async () => {
      const { getPublicProfile } = require('@/services/api/profiles');
      // Stall getPublicProfile so the loading state stays visible
      (getPublicProfile as jest.Mock).mockReturnValue(new Promise(() => {}));

      const ProfileTab = require('../profile').default;
      const { getAllByText } = render(<ProfileTab />, {
        wrapper: ({ children }) => <PaperProvider>{children}</PaperProvider>,
      });
      // statsLoading=true renders '...' for each of the four stat values
      expect(getAllByText('...').length).toBeGreaterThanOrEqual(1);
      // Settle the newsletter effect to avoid act() warnings
      await act(async () => {});
    });
  });

  describe('appearance / theme mode', () => {
    it('calls setThemeMode("dark") when the Dark option is pressed', async () => {
      const { findByLabelText } = await renderProfile();
      fireEvent.press(await findByLabelText('Dark theme'));
      expect(mockSetThemeMode).toHaveBeenCalledWith('dark');
    });

    it('calls setThemeMode("light") when the Light option is pressed', async () => {
      const { findByLabelText } = await renderProfile();
      fireEvent.press(await findByLabelText('Light theme'));
      expect(mockSetThemeMode).toHaveBeenCalledWith('light');
    });

    it('calls setThemeMode("auto") when the Auto option is pressed', async () => {
      const { findByLabelText } = await renderProfile();
      fireEvent.press(await findByLabelText('Auto theme'));
      expect(mockSetThemeMode).toHaveBeenCalledWith('auto');
    });
  });

  describe('profile visibility', () => {
    it('calls updateUser when a visibility option is pressed', async () => {
      // Visibility Pressables have accessibilityRole="radio" but no accessibilityLabel;
      // RTL computes the accessible name from child text content, so we match by regex.
      const { findByRole } = await renderProfile();
      fireEvent.press(await findByRole('radio', { name: /private/i }));
      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            preferences: expect.objectContaining({ profile_visibility: 'private' }),
          }),
        );
      });
    });

    it('calls updateUser and refetch for the Community option', async () => {
      const { findByRole } = await renderProfile();
      fireEvent.press(await findByRole('radio', { name: /community/i }));
      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            preferences: expect.objectContaining({ profile_visibility: 'community' }),
          }),
        );
        expect(mockRefetch).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('logout flow', () => {
    it('opens the logout dialog when Logout is pressed', async () => {
      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Logout'));
      expect(await findByText('Are you sure you want to log out?')).toBeTruthy();
    });

    it('calls logout and triggers refetch on confirm', async () => {
      const { findByLabelText, findAllByText } = await renderProfile();
      // Open the logout dialog
      fireEvent.press(await findByLabelText('Logout'));
      // The dialog renders a second "Logout" button (the confirm button)
      const logoutButtons = await findAllByText('Logout');
      await act(async () => {
        fireEvent.press(logoutButtons[logoutButtons.length - 1]);
      });
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('delete account dialog', () => {
    it('opens when Delete Account? is pressed', async () => {
      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Delete Account?'));
      expect(await findByText('Delete Account')).toBeTruthy();
    });
  });

  describe('edit username dialog', () => {
    it('opens when the username area is pressed', async () => {
      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Edit username'));
      expect(await findByText('Edit Username')).toBeTruthy();
    });
  });

  describe('linked accounts', () => {
    it('shows "Link Google Account" when Google is not linked', async () => {
      const { findByText } = await renderProfile();
      expect(await findByText('Link Google Account')).toBeTruthy();
    });

    it('shows "Unlink Google" and opens the dialog when Google is linked', async () => {
      const { useAuth } = require('@/context/AuthProvider');
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          ...defaultUser,
          oauth_accounts: [{ oauth_name: 'google', account_email: 'g@example.com' }],
        },
        refetch: mockRefetch,
      });

      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Unlink Google'));
      expect(await findByText('Unlink Account')).toBeTruthy();
    });
  });

  describe('newsletter', () => {
    it('shows subscription status after loading', async () => {
      const { findByText } = await renderProfile();
      expect(await findByText('You are not subscribed.')).toBeTruthy();
    });

    it('shows error and retry button when getNewsletterPreference fails', async () => {
      const { getNewsletterPreference } = require('@/services/api/newsletter');
      (getNewsletterPreference as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { findByText } = await renderProfile();
      expect(await findByText('Try again')).toBeTruthy();
    });
  });
});
