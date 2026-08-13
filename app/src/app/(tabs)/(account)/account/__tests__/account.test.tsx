import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

// Variables prefixed with 'mock' can be referenced inside jest.mock() factories.
// babel-jest hoists jest.mock() calls but exempts 'mock'-prefixed variables from TDZ.
const mockRefetch = jest.fn();
const mockSetThemeMode = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
const mockLogout = jest.fn();
const mockUpdateUser = jest.fn();
const mockVerify = jest.fn();
const mockStopStreamMutate = jest.fn();
const mockUseRpiIntegration = jest.fn();
const PRIVATE_VISIBILITY_PATTERN = /private/i;
const COMMUNITY_VISIBILITY_PATTERN = /community/i;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: mockRouterPush,
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

jest.mock('@/features/cameras/rpi/useRpiIntegration', () => ({
  useRpiIntegration: () => mockUseRpiIntegration(),
}));

jest.mock('@/features/cameras/rpi/hooks', () => ({
  useStopYouTubeStreamMutation: () => ({
    mutate: (...args: unknown[]) => mockStopStreamMutate(...args),
    isPending: false,
  }),
}));

jest.mock('@/context/themeMode', () => ({
  useThemeMode: () => ({ themeMode: 'auto', setThemeMode: mockSetThemeMode }),
  useEffectiveColorScheme: () => 'light',
}));

jest.mock('@/services/api/profiles', () => ({
  getPublicProfile: jest.fn(),
}));

jest.mock('@/services/api/auth/authentication', () => ({
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
  createURL: jest.fn().mockReturnValue('relab-app://account'),
  openURL: jest.fn(),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ authorization_url: 'https://oauth.example.com' }),
  }),
}));

// The real KeyboardAwareScrollView needs native modules unavailable in jest —
// mirrors the detail/capture screens' own integration test mocks.
jest.mock('react-native-keyboard-controller', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    KeyboardAwareScrollView: ({
      children,
      ...props
    }: {
      children?: ReactNode;
      [key: string]: unknown;
    }) => mockReact.createElement(ScrollView, { ...props, testID: 'account-scroll' }, children),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultUser = {
  id: 'u1',
  username: 'tester',
  email: 'test@example.com',
  isActive: true,
  isSuperuser: false,
  isVerified: false,
  oauth_accounts: [],
  preferences: { profile_visibility: 'public', theme_mode: 'auto', email_updates_enabled: false },
};

// Both modules are require()d lazily, not imported: a top-level import of either
// pulls in @/services/api/auth/authentication before the mock* consts above are
// initialised, so the jest.mock factory would capture them as undefined.
function renderProfileTab() {
  const { renderWithProviders } = require('@/test-utils/render.tsx');
  const ProfileTab = require('@/app/(tabs)/(account)/account/index.tsx').default;
  return renderWithProviders(<ProfileTab />, { withDialog: true });
}

/** Render the profile tab and wait for all initial async effects to settle. */
async function renderProfile() {
  const result = renderProfileTab();
  // Flush pending microtasks so profile stats loading effects settle
  // inside act() and don't trigger "not wrapped in act" warnings.
  await act(async () => {});
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

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
    mockUseRpiIntegration.mockReturnValue({
      enabled: false,
      loading: false,
      setEnabled: jest.fn(),
    });

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
      params: { redirectTo: '/account' },
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

      const { getAllByText } = renderProfileTab();
      // statsLoading=true renders '...' for each of the four stat values
      expect(getAllByText('...')).toHaveLength(4);
      // Settle the stats effect to avoid act() warnings
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

  describe('email updates', () => {
    it('calls updateUser when the email updates switch is toggled', async () => {
      const { findByRole } = await renderProfile();
      const emailSwitch = await findByRole('switch', { name: 'Receive Relab account updates' });
      fireEvent.press(emailSwitch);
      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            preferences: expect.objectContaining({ email_updates_enabled: true }),
          }),
        );
      });
    });
  });

  describe('logout flow', () => {
    it('opens the logout dialog when Logout is pressed', async () => {
      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Sign out'));
      expect(await findByText('Are you sure you want to sign out?')).toBeTruthy();
    });

    it('calls logout and triggers refetch on confirm', async () => {
      const { findByLabelText, findAllByText } = await renderProfile();
      // Open the logout dialog
      fireEvent.press(await findByLabelText('Sign out'));
      // The dialog renders a second "Sign out" button (the confirm button)
      const logoutButtons = await findAllByText('Sign out');
      await act(async () => {
        fireEvent.press(logoutButtons[logoutButtons.length - 1]);
      });
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('delete account dialog', () => {
    it('opens when Delete account? is pressed', async () => {
      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Delete account?'));
      expect(await findByText('Delete account')).toBeTruthy();
    });
  });

  describe('edit username dialog', () => {
    it('opens when the username area is pressed', async () => {
      const { findByLabelText, findByText } = await renderProfile();
      fireEvent.press(await findByLabelText('Edit username'));
      expect(await findByText('Save')).toBeTruthy();
    });
  });

  describe('security section', () => {
    it('offers only enrolment while two-step verification is off', async () => {
      const { findByLabelText, queryByLabelText } = await renderProfile();

      expect(await findByLabelText('Two-step verification')).toBeTruthy();
      expect(queryByLabelText('Turn off two-step verification')).toBeNull();
    });

    it('offers the manage actions once two-step verification is on', async () => {
      const { useAuth } = require('@/context/auth.ts');
      (useAuth as jest.Mock).mockReturnValue({
        user: { ...defaultUser, mfaEnabled: true },
        refetch: mockRefetch,
      });

      const { findByLabelText, findByText } = await renderProfile();

      expect(await findByText('On — you enter a code at login')).toBeTruthy();
      expect(await findByLabelText('Generate new recovery codes')).toBeTruthy();
      expect(await findByLabelText('Reset authenticator key')).toBeTruthy();
      expect(await findByLabelText('Turn off two-step verification')).toBeTruthy();
    });
  });

  describe('integrations', () => {
    it('hides the camera and YouTube rows while the RPi integration is off', async () => {
      const { queryByLabelText, queryByText } = await renderProfile();

      expect(queryByLabelText('Manage cameras')).toBeNull();
      expect(queryByText('YouTube Live')).toBeNull();
    });

    it('reveals the camera and YouTube rows once the RPi integration is on', async () => {
      mockUseRpiIntegration.mockReturnValue({
        enabled: true,
        loading: false,
        setEnabled: jest.fn(),
      });

      const { findByLabelText, findByText } = await renderProfile();

      expect(await findByText('YouTube Live')).toBeTruthy();
      fireEvent.press(await findByLabelText('Manage cameras'));
      expect(mockRouterPush).toHaveBeenCalledWith('/cameras');
    });
  });

  describe('linked accounts', () => {
    it('shows "Link Google account" when Google is not linked', async () => {
      const { findByText } = await renderProfile();
      expect(await findByText('Link Google account')).toBeTruthy();
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
      expect(await findByText('Unlink account')).toBeTruthy();
    });
  });
});
