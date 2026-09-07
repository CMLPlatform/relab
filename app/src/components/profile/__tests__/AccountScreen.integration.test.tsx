import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

// Variables prefixed with 'mock' can be referenced inside jest.mock() factories.
// babel-jest hoists jest.mock() calls but exempts 'mock'-prefixed variables from TDZ.
const mockRefetch = jest.fn();
const mockSetThemeMode = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
const mockUseRpiIntegration = jest.fn();
const mockScrollTo = jest.fn();

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
    mutate: jest.fn(),
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
  logout: jest.fn().mockResolvedValue(undefined),
  unlinkOAuth: jest.fn().mockResolvedValue(undefined),
  updateUser: jest.fn().mockResolvedValue({}),
  verify: jest.fn().mockResolvedValue(true),
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

// Mirrors the detail screen's own integration tests: the real KeyboardAwareScrollView
// needs native modules unavailable in jest, so it's swapped for a plain ScrollView.
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

// The real hook's scrollTo depends on onLayout-driven position registration,
// which jsdom never fires — that math is covered by useSectionNav.test.ts and
// useAnchoredSectionNav.test.ts. Here we only prove AccountScreen wires a chip
// press through to the nav's scrollTo handler with the right key.
jest.mock('@/hooks/useSectionNav', () => ({
  useSectionNav: () => ({
    registerSection: jest.fn(),
    unregisterSection: jest.fn(),
    scrollTo: mockScrollTo,
    onScrollSpy: jest.fn(),
    activeKey: 'preferences',
  }),
}));

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

const SECTION_LABELS = ['Preferences', 'Integrations', 'Security & sessions', 'Danger zone'];

// Both modules are require()d lazily, not imported: a top-level import pulls in
// @/services/api/auth/authentication before the mock* consts above are initialised,
// so the jest.mock factory would capture them as undefined.
function renderAccountScreen() {
  const { renderWithProviders } = require('@/test-utils/render.tsx');
  const { AccountScreen } = require('@/components/profile/AccountScreen.tsx');
  return renderWithProviders(<AccountScreen />, { withDialog: true });
}

async function renderAccount() {
  const result = renderAccountScreen();
  await act(async () => {});
  return result;
}

// Walks the rendered tree collecting text nodes in document order — used to
// assert section order without depending on a real layout engine (mirrors
// product-page-state.integration.test.tsx's collectText).
function collectText(instance: ReturnType<typeof screen.getByTestId>): string[] {
  const out: string[] = [];
  const walk = (node: ReturnType<typeof screen.getByTestId>) => {
    for (const child of node.children) {
      if (typeof child === 'string') {
        out.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(instance);
  return out;
}

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuth } = require('@/context/auth.ts');
    (useAuth as jest.Mock).mockReturnValue({ user: defaultUser, refetch: mockRefetch });
    mockRefetch.mockResolvedValue(undefined);
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

  it('renders the hero username', async () => {
    const { findByText } = await renderAccount();
    expect(await findByText('tester.')).toBeTruthy();
  });

  it('folds the stats row into the header (no separate Profile section)', async () => {
    const { findByText, queryByText } = await renderAccount();
    // product_count: 3 from the getPublicProfile mock — proves stats render
    // in the header now that the standalone "profile" section is gone.
    expect(await findByText('3')).toBeTruthy();
    expect(queryByText('Profile')).toBeNull();
  });

  it('renders all four section titles in order', async () => {
    await renderAccount();
    const scroll = screen.getByTestId('account-scroll');
    const texts = collectText(scroll);
    const indices = SECTION_LABELS.map((label) => texts.indexOf(label));
    expect(indices.every((index) => index >= 0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('renders chips with the four section labels', async () => {
    await renderAccount();
    const chips = screen.getByTestId('section-nav-chips');
    for (const label of SECTION_LABELS) {
      expect(within(chips).getByText(label)).toBeOnTheScreen();
    }
  });

  it('pressing the Danger zone chip calls the nav scrollTo handler', async () => {
    await renderAccount();
    const chips = screen.getByTestId('section-nav-chips');
    fireEvent.press(within(chips).getByText('Danger zone'));
    expect(mockScrollTo).toHaveBeenCalledWith('danger');
  });

  it('still opens the edit-username dialog', async () => {
    const { findByLabelText, findByText } = await renderAccount();
    fireEvent.press(await findByLabelText('Edit username'));
    expect(await findByText('Save')).toBeTruthy();
  });
});
