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
const PRIVATE_VISIBILITY_PATTERN = /private/i;
const COMMUNITY_VISIBILITY_PATTERN = /community/i;

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

jest.mock('@/context/auth', () => ({
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

jest.mock('@/context/themeMode', () => ({
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

jest.mock('@/components/profile/sections/shared', () => {
  const React = require('react');
  return {
    ProfileLayout: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/components/profile/sections/HeroStats', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    ProfileHero: ({
      profile,
      onEditUsername,
    }: {
      profile: { username: string; email: string };
      onEditUsername: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, `${profile.username}.`),
        React.createElement(Text, null, profile.email),
        React.createElement(
          Pressable,
          { accessibilityLabel: 'Edit username', accessibilityRole: 'button', onPress: onEditUsername },
          React.createElement(Text, null, 'Edit username'),
        ),
      ),
    ProfileStatsSection: ({
      ownStats,
      statsLoading,
    }: {
      ownStats?: { product_count?: number } | null;
      statsLoading: boolean;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, statsLoading ? '...' : String(ownStats?.product_count ?? 0)),
      ),
  };
});

jest.mock('@/components/profile/sections/Preferences', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    ProfileAppearanceSection: ({
      onSetThemeMode,
    }: {
      onSetThemeMode: (mode: 'light' | 'dark' | 'auto') => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(
          Pressable,
          { accessibilityLabel: 'Dark theme', accessibilityRole: 'button', onPress: () => onSetThemeMode('dark') },
          React.createElement(Text, null, 'Dark theme'),
        ),
        React.createElement(
          Pressable,
          { accessibilityLabel: 'Light theme', accessibilityRole: 'button', onPress: () => onSetThemeMode('light') },
          React.createElement(Text, null, 'Light theme'),
        ),
        React.createElement(
          Pressable,
          { accessibilityLabel: 'Auto theme', accessibilityRole: 'button', onPress: () => onSetThemeMode('auto') },
          React.createElement(Text, null, 'Auto theme'),
        ),
      ),
    ProfileVisibilitySection: ({
      onChangeVisibility,
    }: {
      onChangeVisibility: (visibility: 'public' | 'community' | 'private') => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(
          Pressable,
          { accessibilityRole: 'radio', onPress: () => onChangeVisibility('private') },
          React.createElement(Text, null, 'Private'),
        ),
        React.createElement(
          Pressable,
          { accessibilityRole: 'radio', onPress: () => onChangeVisibility('community') },
          React.createElement(Text, null, 'Community'),
        ),
      ),
  };
});

jest.mock('@/components/profile/sections/AccountSections', () => {
  const React = require('react');
  const { Pressable, Switch, Text, View } = require('react-native');

  return {
    ProfileAccountSection: ({
      isVerified,
      onLogout,
      onVerifyAccount,
    }: {
      isVerified: boolean;
      onLogout: () => void;
      onVerifyAccount: () => void;
    }) =>
      React.createElement(
        View,
        null,
        !isVerified
          ? React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: onVerifyAccount },
              React.createElement(Text, null, 'Verify email address'),
            )
          : null,
        React.createElement(
          Pressable,
          { accessibilityLabel: 'Logout', accessibilityRole: 'button', onPress: onLogout },
          React.createElement(Text, null, 'Logout'),
        ),
      ),
    ProfileDangerZoneSection: ({ onDeleteAccount }: { onDeleteAccount: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityLabel: 'Delete Account?', accessibilityRole: 'button', onPress: onDeleteAccount },
        React.createElement(Text, null, 'Delete Account?'),
      ),
    ProfileLinkedAccountsSection: ({
      isGoogleLinked,
      isGithubLinked,
      onLinkOAuth,
      onRequestUnlink,
    }: {
      isGoogleLinked: boolean;
      isGithubLinked: boolean;
      onLinkOAuth: (provider: string) => void;
      onRequestUnlink: (provider: string) => void;
    }) =>
      React.createElement(
        View,
        null,
        isGoogleLinked
          ? React.createElement(
              Pressable,
              { accessibilityLabel: 'Unlink Google', accessibilityRole: 'button', onPress: () => onRequestUnlink('google') },
              React.createElement(Text, null, 'Unlink Google'),
            )
          : React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: () => onLinkOAuth('google') },
              React.createElement(Text, null, 'Link Google Account'),
            ),
        isGithubLinked
          ? React.createElement(
              Pressable,
              { accessibilityLabel: 'Unlink GitHub', accessibilityRole: 'button', onPress: () => onRequestUnlink('github') },
              React.createElement(Text, null, 'Unlink GitHub'),
            )
          : React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: () => onLinkOAuth('github') },
              React.createElement(Text, null, 'Link GitHub Account'),
            ),
      ),
    ProfileNewsletterSection: ({
      newsletterSubscribed,
      newsletterLoading,
      newsletterError,
      onToggleNewsletter,
      onReloadNewsletterPreference,
    }: {
      newsletterSubscribed: boolean;
      newsletterLoading: boolean;
      newsletterError: string | null;
      onToggleNewsletter: (value: boolean) => void;
      onReloadNewsletterPreference: () => void;
    }) =>
      React.createElement(
        View,
        null,
        newsletterLoading
          ? React.createElement(Text, null, 'Loading newsletter')
          : React.createElement(
              Text,
              null,
              newsletterSubscribed ? 'You are subscribed.' : 'You are not subscribed.',
            ),
        React.createElement(Switch, {
          accessibilityRole: 'switch',
          value: newsletterSubscribed,
          onValueChange: onToggleNewsletter,
        }),
        newsletterError ? React.createElement(Text, null, newsletterError) : null,
        newsletterError
          ? React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: onReloadNewsletterPreference },
              React.createElement(Text, null, 'Try again'),
            )
          : null,
      ),
  };
});

jest.mock('@/components/profile/sections/Dialogs', () => {
  const React = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');

  return {
    ProfileDialogs: ({
      editUsernameVisible,
      onDismissEditUsername,
      newUsername,
      onChangeUsername,
      onSaveUsername,
      unlinkDialogVisible,
      onDismissUnlink,
      providerToUnlink,
      onConfirmUnlink,
      logoutDialogVisible,
      onDismissLogout,
      onConfirmLogout,
      deleteDialogVisible,
      onDismissDeleteDialog,
    }: {
      editUsernameVisible: boolean;
      onDismissEditUsername: () => void;
      newUsername: string;
      onChangeUsername: (value: string) => void;
      onSaveUsername: () => void;
      unlinkDialogVisible: boolean;
      onDismissUnlink: () => void;
      providerToUnlink: string;
      onConfirmUnlink: () => void;
      logoutDialogVisible: boolean;
      onDismissLogout: () => void;
      onConfirmLogout: () => void;
      deleteDialogVisible: boolean;
      onDismissDeleteDialog: () => void;
    }) =>
        React.createElement(
          View,
          null,
          editUsernameVisible
            ? React.createElement(
                View,
                null,
                React.createElement(Text, null, 'Edit Username'),
                React.createElement(TextInput, { value: newUsername, onChangeText: onChangeUsername }),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onSaveUsername },
                  React.createElement(Text, null, 'Save'),
                ),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onDismissEditUsername },
                  React.createElement(Text, null, 'Cancel'),
                ),
              )
            : null,
          unlinkDialogVisible
            ? React.createElement(
                View,
                null,
                React.createElement(Text, null, 'Unlink Account'),
                React.createElement(Text, null, providerToUnlink),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onConfirmUnlink },
                  React.createElement(Text, null, 'Unlink'),
                ),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onDismissUnlink },
                  React.createElement(Text, null, 'Cancel'),
                ),
              )
            : null,
          logoutDialogVisible
            ? React.createElement(
                View,
                null,
                React.createElement(Text, null, 'Are you sure you want to log out?'),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onConfirmLogout },
                  React.createElement(Text, null, 'Logout'),
                ),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onDismissLogout },
                  React.createElement(Text, null, 'Cancel'),
                ),
              )
            : null,
          deleteDialogVisible
            ? React.createElement(
                View,
                null,
                React.createElement(Text, null, 'Delete Account'),
                React.createElement(
                  Pressable,
                  { accessibilityRole: 'button', onPress: onDismissDeleteDialog },
                  React.createElement(Text, null, 'Cancel'),
                ),
              )
            : null,
        ),
  };
});

jest.mock('@/components/profile/sections/Integrations', () => ({
  ProfileIntegrationsSection: () => null,
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
  const ProfileTab = require('../profile.tsx').default;
  const result = render(<ProfileTab />, {
    wrapper: ({ children }) => <PaperProvider>{children}</PaperProvider>,
  });
  // Flush pending microtasks so newsletter/stats loading effects settle
  // inside act() and don't trigger "not wrapped in act" warnings.
  await act(async () => {});
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: this file is a broad integration-style suite with one common profile harness.
describe('ProfileTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuth } = require('@/context/auth.ts');
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
      require('@/services/api/newsletter.ts');
    (getNewsletterPreference as jest.Mock).mockResolvedValue({ subscribed: false });
    (setNewsletterPreference as jest.Mock).mockImplementation(async (v: boolean) => ({
      subscribed: v,
    }));

    const { getPublicProfile } = require('@/services/api/profiles.ts');
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
    const { useAuth } = require('@/context/auth.ts');
    (useAuth as jest.Mock).mockReturnValue({
      user: { ...defaultUser, isVerified: true },
      refetch: mockRefetch,
    });
    const { queryByText } = await renderProfile();
    expect(queryByText('Verify email address')).toBeNull();
  });

  it('redirects to login when there is no authenticated user', async () => {
    const { useAuth } = require('@/context/auth.ts');
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
      const { getPublicProfile } = require('@/services/api/profiles.ts');
      // Stall getPublicProfile so the loading state stays visible
      (getPublicProfile as jest.Mock).mockReturnValue(new Promise(() => {}));

      const ProfileTab = require('../profile.tsx').default;
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
      fireEvent.press(await findByRole('radio', { name: PRIVATE_VISIBILITY_PATTERN }));
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
      fireEvent.press(await findByRole('radio', { name: COMMUNITY_VISIBILITY_PATTERN }));
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
      const { useAuth } = require('@/context/auth.ts');
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
      const { getNewsletterPreference } = require('@/services/api/newsletter.ts');
      (getNewsletterPreference as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { findByText } = await renderProfile();
      expect(await findByText('Try again')).toBeTruthy();
    });
  });
});
