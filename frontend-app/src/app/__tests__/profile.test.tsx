import { render } from '@testing-library/react-native';

// Mocks for contexts and services
jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      username: 'tester',
      email: 'test@example.com',
      isActive: true,
      isSuperuser: false,
      isVerified: false,
      oauth_accounts: [],
      preferences: { profile_visibility: 'public' },
    },
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/useRpiIntegration', () => ({
  useRpiIntegration: () => ({ enabled: false, loading: false, setEnabled: jest.fn() }),
}));

jest.mock('@/context/ThemeModeProvider', () => ({
  useThemeMode: () => ({ themeMode: 'auto', setThemeMode: jest.fn() }),
}));

jest.mock('@/services/api/newsletter', () => ({
  getNewsletterPreference: async () => ({ subscribed: false }),
  setNewsletterPreference: async (v: boolean) => ({ subscribed: v }),
}));

jest.mock('@/services/api/profiles', () => ({
  getPublicProfile: async (username: string) => ({
    username,
    created_at: '',
    product_count: 1,
    total_weight_kg: 0,
    image_count: 0,
    top_category: 'None',
  }),
}));

describe('ProfileTab', () => {
  it('renders username and email', async () => {
    const ProfileTab = require('../profile').default;
    const { findByText } = render(<ProfileTab />);

    expect(await findByText('tester.')).toBeTruthy();
    expect(await findByText('test@example.com')).toBeTruthy();
  });

  it('shows verify action when user is not verified', async () => {
    const ProfileTab = require('../profile').default;
    const { findByText } = render(<ProfileTab />);

    expect(await findByText('Verify email address')).toBeTruthy();
  });
});
