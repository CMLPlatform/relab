import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useGlobalSearchParams } from 'expo-router';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import UserProfileScreen from '@/app/users/[username]';
import { API_URL } from '@/config';
import { ApiError } from '@/services/api/errors';
import type { PublicProfileView } from '@/services/api/profiles';
import { getPublicProfile } from '@/services/api/profiles';
import { renderWithProviders } from '@/test-utils/index';
import { server } from '@/test-utils/server';

jest.mock('@/services/api/profiles');
jest.mock('expo-router', () => {
  return {
    useRouter: jest.fn().mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: jest.fn().mockReturnValue({}),
    useNavigation: jest.fn().mockReturnValue({
      setOptions: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
    }),
    Link: ({ children }: { children: ReactNode }) => children,
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
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });
    await waitFor(() => expect(screen.getByTestId('activity-indicator')).toBeOnTheScreen());
    expect(screen.queryByText('alice')).toBeNull();
  });

  it('renders the profile card with all stats on success', async () => {
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('alice')).toBeOnTheScreen());

    // Avatar initials
    expect(screen.getByText('AL')).toBeOnTheScreen();
    // Stats
    expect(screen.getByText('5.5')).toBeOnTheScreen();
    expect(screen.getByText('7')).toBeOnTheScreen();
    expect(screen.getByText('Electronics')).toBeOnTheScreen();
    // Labels
    expect(screen.getByText('Total kg')).toBeOnTheScreen();
    expect(screen.getByText('Photos')).toBeOnTheScreen();
    expect(screen.getByText('Top category')).toBeOnTheScreen();
  });

  it('lists the user’s public products beneath the stats', async () => {
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    // The default MSW /products handler returns one product for owner=<username>.
    await waitFor(() =>
      expect(screen.getByText('Recycled Aluminum Laptop Stand')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Products · 1')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Load more products')).toBeNull();
  });

  it('shows an empty state when the user has no public products', async () => {
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    server.use(
      http.get(`${API_URL}/products`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 24, pages: 0 }),
      ),
    );
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('No public products yet')).toBeOnTheScreen());
  });

  it('shows generic error message when fetch fails', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('Network error'));
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('Network error')).toBeOnTheScreen());
    expect(screen.queryByTestId('activity-indicator')).toBeNull();
  });

  it('shows friendly privacy message for a 404 error', async () => {
    mockGetPublicProfile.mockRejectedValue(new ApiError('Profile not found', 404));
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByText('This profile is private or does not exist.')).toBeOnTheScreen(),
    );
  });

  it('does not call getPublicProfile when username param is undefined', async () => {
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ username: undefined });

    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    // loading=true is set initially, but fetchProfile returns early without calling API
    // The loading state stays true since setLoading(false) is in finally of the skipped block
    // Wait a tick so useEffect fires
    await waitFor(() => expect(mockGetPublicProfile).not.toHaveBeenCalled());
    expect(screen.queryByText('Total kg')).toBeNull();
  });

  it('does not call getPublicProfile when username is an array', async () => {
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ username: ['alice', 'bob'] });

    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(mockGetPublicProfile).not.toHaveBeenCalled());
    expect(screen.queryByText('Total kg')).toBeNull();
  });

  it('re-fetches the profile when the error state’s Retry action is pressed', async () => {
    // A prior test in this suite leaves useGlobalSearchParams mocked to an array
    // username (jest.clearAllMocks() doesn't undo mockReturnValue); restore the
    // normal single-username case explicitly instead of relying on file order.
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ username: 'alice' });
    mockGetPublicProfile
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(profileFixture);
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('Network error')).toBeOnTheScreen());
    expect(mockGetPublicProfile).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText('alice')).toBeOnTheScreen());
    expect(mockGetPublicProfile).toHaveBeenCalledTimes(2);
  });
});
