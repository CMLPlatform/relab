import { screen, waitFor } from '@testing-library/react-native';
import { useGlobalSearchParams } from 'expo-router';
import type { PublicProfileView } from '@/services/api/profiles';
import { getPublicProfile } from '@/services/api/profiles';
import { renderWithProviders } from '@/test-utils/index';
import UserProfileScreen from '../[username]';

jest.mock('@/services/api/profiles');
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn().mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: jest.fn().mockReturnValue({}),
    useNavigation: jest.fn().mockReturnValue({
      setOptions: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
    }),
    Link: ({ children }: { children: React.ReactNode }) => children,
    useGlobalSearchParams: jest.fn().mockReturnValue({ username: 'alice' }),
    Stack: { Screen: () => null },
  };
});

const mockGetPublicProfile = jest.mocked(getPublicProfile);

const profileFixture: PublicProfileView = {
  username: 'alice',
  created_at: '2024-01-15T00:00:00Z',
  product_count: 3,
  total_weight_kg: 5.5,
  image_count: 7,
  top_category: 'Electronics',
};

describe('UserProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading spinner while the profile is being fetched', async () => {
    mockGetPublicProfile.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<UserProfileScreen />);
    expect(screen.getByTestId('activity-indicator')).toBeOnTheScreen();
    expect(screen.queryByText('alice')).toBeNull();
  });

  it('renders the profile card with all stats on success', async () => {
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    renderWithProviders(<UserProfileScreen />);

    await waitFor(() => expect(screen.getByText('alice')).toBeOnTheScreen());

    // Avatar initials
    expect(screen.getByText('AL')).toBeOnTheScreen();
    // Stats
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByText('5.5')).toBeOnTheScreen();
    expect(screen.getByText('7')).toBeOnTheScreen();
    expect(screen.getByText('Electronics')).toBeOnTheScreen();
    // Labels
    expect(screen.getByText('Products')).toBeOnTheScreen();
    expect(screen.getByText('Total kg')).toBeOnTheScreen();
    expect(screen.getByText('Photos')).toBeOnTheScreen();
    expect(screen.getByText('Top Category')).toBeOnTheScreen();
  });

  it('shows generic error message when fetch fails', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<UserProfileScreen />);

    await waitFor(() => expect(screen.getByText('Network error')).toBeOnTheScreen());
    expect(screen.queryByTestId('activity-indicator')).toBeNull();
  });

  it('shows friendly privacy message for "Profile not found" error', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('Profile not found'));
    renderWithProviders(<UserProfileScreen />);

    await waitFor(() =>
      expect(screen.getByText('This profile is private or does not exist.')).toBeOnTheScreen(),
    );
  });

  it('does not call getPublicProfile when username param is undefined', async () => {
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ username: undefined });

    renderWithProviders(<UserProfileScreen />);

    // loading=true is set initially, but fetchProfile returns early without calling API
    // The loading state stays true since setLoading(false) is in finally of the skipped block
    // Wait a tick so useEffect fires
    await waitFor(() => expect(mockGetPublicProfile).not.toHaveBeenCalled());
    expect(screen.queryByText('Products')).toBeNull();
  });

  it('does not call getPublicProfile when username is an array', async () => {
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ username: ['alice', 'bob'] });

    renderWithProviders(<UserProfileScreen />);

    await waitFor(() => expect(mockGetPublicProfile).not.toHaveBeenCalled());
    expect(screen.queryByText('Products')).toBeNull();
  });
});
