import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useGlobalSearchParams } from 'expo-router';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import UserProfileScreen from '@/app/users/[username]';
import { API_URL } from '@/config';
import { ApiError } from '@/services/api/errors';
import type { PublicProfileView } from '@/services/api/profiles';
import { getPublicProfile } from '@/services/api/profiles';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';
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
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeOnTheScreen());
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

  // A prolific profile must not mount every card it has loaded: the grid is a
  // virtualized list under the profile, and "Load more" appends the next page.
  it('renders a long product list lazily and appends the next page on Load more', async () => {
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ username: 'alice' });
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    const page = (n: number) =>
      Array.from({ length: 24 }, (_, i) => ({
        id: (n - 1) * 24 + i + 1,
        name: `Part ${(n - 1) * 24 + i + 1}`,
        owner_username: 'alice',
      }));
    server.use(
      http.get(`${API_URL}/products`, ({ request }) => {
        const n = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json({ items: page(n), total: 48, page: n, size: 24, pages: 2 });
      }),
    );
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('Products · 48')).toBeOnTheScreen());
    expect(screen.getByText('Part 1')).toBeOnTheScreen();
    expect(screen.queryByText('Part 24')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Load more products'));

    await waitFor(() => expect(screen.queryByLabelText('Load more products')).toBeNull());
    expect(screen.getByText('Products · 48')).toBeOnTheScreen();
  });

  // VoiceOver ignores the footer's live region; the appended count is announced explicitly.
  it('announces the loaded count on iOS after Load more', async () => {
    mockPlatform('ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    const page = (n: number) =>
      Array.from({ length: 24 }, (_, i) => ({
        id: (n - 1) * 24 + i + 1,
        name: `Part ${(n - 1) * 24 + i + 1}`,
        owner_username: 'alice',
      }));
    server.use(
      http.get(`${API_URL}/products`, ({ request }) => {
        const n = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json({ items: page(n), total: 48, page: n, size: 24, pages: 2 });
      }),
    );
    try {
      await renderWithProviders(<UserProfileScreen />, { withAuth: true });
      await waitFor(() => expect(screen.getByText('24 of 48 products')).toBeOnTheScreen());
      expect(announce).not.toHaveBeenCalledWith('24 of 48 products');

      await fireEvent.press(screen.getByLabelText('Load more products'));

      await waitFor(() => expect(announce).toHaveBeenCalledWith('48 of 48 products'));
      expect(screen.getByText('48 of 48 products')).toBeOnTheScreen();
    } finally {
      announce.mockRestore();
      restorePlatform();
    }
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

  it('shows a dash for the top category of a profile with no products', async () => {
    mockGetPublicProfile.mockResolvedValue({
      ...profileFixture,
      product_count: 0,
      total_weight_kg: 0,
      image_count: 0,
      // The API sends null when there is no product to rank.
      top_category: null as unknown as string,
    });
    server.use(
      http.get(`${API_URL}/products`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 24, pages: 0 }),
      ),
    );
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('Top category')).toBeOnTheScreen());
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('shows an error with retry, not the empty state, when products fail to load', async () => {
    mockGetPublicProfile.mockResolvedValue(profileFixture);
    let calls = 0;
    server.use(
      http.get(`${API_URL}/products`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: 'boom' }, { status: 503 })
          : HttpResponse.json({ items: [], total: 0, page: 1, size: 24, pages: 0 });
      }),
    );
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("Couldn't load products")).toBeOnTheScreen());
    expect(screen.queryByText('No public products yet')).toBeNull();

    await fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText('No public products yet')).toBeOnTheScreen());
  });

  it('shows generic error message when fetch fails', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('Network error'));
    await renderWithProviders(<UserProfileScreen />, { withAuth: true });

    await waitFor(() => expect(screen.getByText('Network error')).toBeOnTheScreen());
    expect(screen.queryByRole('progressbar')).toBeNull();
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
