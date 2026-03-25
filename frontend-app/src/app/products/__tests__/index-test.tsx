import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Products from '../index';
import { renderWithProviders } from '@/test-utils';
import type { User } from '@/types/User';
const mockUseAuth = jest.fn();

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: jest.fn().mockReturnValue(false),
}));

jest.mock('expo-image', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ImageBackground: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LinearGradient: View };
});

jest.mock('@/services/newProductStore', () => ({
  setNewProductIntent: jest.fn(),
}));

jest.mock('@/components/common/ProductCard', () => {
  return function ProductCardMock({ product }: { product: { name: string } }) {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(Text, { testID: 'product-card' }, product.name);
  };
});

jest.mock('@/components/common/ProductCardSkeleton', () => {
  return function ProductCardSkeletonMock() {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(View, { testID: 'product-card-skeleton' });
  };
});

// Controlled query state
const mockRefetch = jest.fn();
const mockUseProductsQuery = jest.fn();
const mockUseBrandsQuery = jest.fn();
const mockUseProductTypesQuery = jest.fn();
const mockSetParams = jest.fn();
const mockPush = jest.fn();

const mockUser = (overrides: Partial<User> = {}): User => ({
  id: '1',
  email: 'a@b.com',
  username: 'alice',
  isActive: true,
  isVerified: true,
  isSuperuser: false,
  oauth_accounts: [],
  ...overrides,
});

jest.mock('@/hooks/useProductQueries', () => ({
  useProductsQuery: (...args: unknown[]) => mockUseProductsQuery(...args),
  useSearchBrandsQuery: (...args: unknown[]) => mockUseBrandsQuery(...args),
  useSearchProductTypesQuery: (...args: unknown[]) => mockUseProductTypesQuery(...args),
  useBrandsQuery: jest.fn().mockReturnValue({ data: [], isLoading: false }),
  useProductTypesQuery: jest.fn().mockReturnValue({ data: [], isLoading: false }),
  PRODUCT_SORT_OPTIONS: [
    { label: 'Newest first', value: ['-created_at'] },
    { label: 'Oldest first', value: ['created_at'] },
    { label: 'Name A→Z', value: ['name'] },
    { label: 'Name Z→A', value: ['-name'] },
    { label: 'Brand A→Z', value: ['brand'] },
    { label: 'Brand Z→A', value: ['-brand'] },
  ],
}));

const emptyQueryResult = {
  data: { items: [], pages: 1, page: 1, total: 0, size: 20 },
  isFetching: false,
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

const loadingQueryResult = {
  data: undefined,
  isFetching: false,
  isLoading: true,
  error: null,
  refetch: mockRefetch,
};

const pagedQueryResult = {
  data: {
    items: [
      { id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] },
      { id: 2, name: 'Product B', ownedBy: 'bob', images: [], videos: [] },
    ],
    pages: 3,
    page: 1,
    total: 55,
    size: 20,
  },
  isFetching: false,
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: null });
  await AsyncStorage.removeItem('products_info_card_dismissed_guest');
  await AsyncStorage.removeItem('products_info_card_dismissed_authenticated');
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    setParams: mockSetParams,
  });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  mockUseProductsQuery.mockReturnValue(emptyQueryResult);
  mockUseBrandsQuery.mockReturnValue({ data: [], isLoading: false });
  mockUseProductTypesQuery.mockReturnValue({ data: [], isLoading: false });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Products screen', () => {
  it('renders the search bar and sort button', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search products')).toBeTruthy();
    });
  });

  it('shows skeleton rows while loading', async () => {
    mockUseProductsQuery.mockReturnValue(loadingQueryResult);
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      // Skeleton renders 8 placeholder cards — check at least one exists
      expect(screen.getAllByTestId('product-card-skeleton').length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no products match', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText('No products available yet. Sign in to add your own.')).toBeTruthy();
    });
  });

  it('shows search-specific empty state when searching', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'xyz');

    await waitFor(() => {
      expect(screen.getByText('No products found matching your search.')).toBeTruthy();
    });
  });

  it('resets page to 1 when search text changes (colocated in onChangeText)', async () => {
    // Start on page 2 by making the query return multi-page data and simulating
    // a page advance — then type in search and verify page arg resets to 1
    mockUseProductsQuery.mockReturnValue(pagedQueryResult);
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    // Verify initial call uses page 1
    expect(mockUseProductsQuery).toHaveBeenLastCalledWith(
      expect.any(String), // filterMode
      1, // page
      expect.any(String), // debouncedSearch
      expect.any(Array), // sortBy
      expect.any(Object), // extra filters
    );

    // Typing resets page to 1 synchronously in the handler
    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'hello');

    await waitFor(() => {
      const calls = mockUseProductsQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as unknown[];
      expect(lastCall[1]).toBe(1); // page arg stays 1
    });
  });

  it('clears the search query from the URL when the search box is emptied', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'saved query' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), '');

    expect(mockSetParams).toHaveBeenCalledWith({ q: undefined, page: '1' });
  });

  it('resets page to 1 when sort changes (colocated in onPress)', async () => {
    mockUseProductsQuery.mockReturnValue(pagedQueryResult);
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    // Open sort menu and pick a different option
    fireEvent.press(screen.getByLabelText('Sort products'));
    await screen.findByText('Oldest first');
    fireEvent.press(screen.getByText('Oldest first'));

    expect(mockSetParams).toHaveBeenCalledWith({ sort: 'created_at', page: '1' });
  });

  it('renders welcome banner on first visit', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText('Welcome to RELab')).toBeTruthy();
      expect(screen.getByText('Browse products freely. Sign in when you are ready to add your own.')).toBeTruthy();
    });
  });

  it('dismisses welcome banner when Maybe later is pressed', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Maybe later');
    fireEvent.press(screen.getByText('Maybe later'));
    await waitFor(() => {
      expect(screen.queryByText('Welcome to RELab')).toBeNull();
    });
  });

  it('shows the signed-in welcome after a guest dismisses the first-visit banner', async () => {
    const { rerender } = renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Maybe later');
    fireEvent.press(screen.getByText('Maybe later'));

    mockUseAuth.mockReturnValue({ user: mockUser() });
    rerender(<Products />);

    await waitFor(() => {
      expect(screen.getByText('Ready to add products')).toBeTruthy();
      expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
      expect(screen.getByText('profile')).toBeTruthy();
    });
  });

  it('prompts unverified signed-in users to verify their email', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('Verify your email to start creating')).toBeTruthy();
      expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
      expect(screen.getByText('profile')).toBeTruthy();
      expect(screen.getByText('Got it')).toBeTruthy();
      expect(screen.getByText('Verify email')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Verify email'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('uses Got it for the dismiss action when signed in', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('Got it')).toBeTruthy();
      expect(screen.getByText('profile')).toBeTruthy();
    });
  });
});

describe('FAB and new-product flow', () => {
  it('shows sign-in dialog when guest presses the FAB', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByLabelText('Sign in to create products');
    fireEvent.press(screen.getByLabelText('Sign in to create products'));
    await waitFor(() => {
      expect(screen.getByText('Sign in to create products')).toBeTruthy();
    });
  });

  it('shows create-product dialog when verified user presses FAB', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByLabelText('Create new product');
    fireEvent.press(screen.getByLabelText('Create new product'));
    await waitFor(() => {
      expect(screen.getByText('Create New Product')).toBeTruthy();
    });
  });

  it('shows email-verification dialog when unverified user presses FAB', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByLabelText('Create new product');
    fireEvent.press(screen.getByLabelText('Create new product'));
    await waitFor(() => {
      expect(screen.getByText('Email Verification Required')).toBeTruthy();
    });
  });
});

describe('Filter chips and modals', () => {
  it('opens brand filter modal when Brand chip is pressed', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Brand');
    fireEvent.press(screen.getByText('Brand'));
    await waitFor(() => {
      expect(screen.getByText('Filter by Brand')).toBeTruthy();
    });
  });

  it('opens product type filter modal when Type chip is pressed', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Type');
    fireEvent.press(screen.getByText('Type'));
    await waitFor(() => {
      expect(screen.getByText('Filter by Product Type')).toBeTruthy();
    });
  });

  it('activates a date preset chip when pressed', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Last 7d');
    fireEvent.press(screen.getByText('Last 7d'));
    expect(mockSetParams).toHaveBeenCalledWith({ days: '7', page: '1' });
  });

  it('clears an active date preset when the same chip is pressed again', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '7' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Last 7d');

    fireEvent.press(screen.getByText('Last 7d'));

    expect(mockSetParams).toHaveBeenCalledWith({ days: undefined, page: '1' });
  });
});

describe('Error state', () => {
  it('shows error message and retry button on query error', async () => {
    mockUseProductsQuery.mockReturnValue({
      ...emptyQueryResult,
      error: new Error('Network failure'),
    });
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText(/Network failure/)).toBeTruthy();
      expect(screen.getByLabelText('Retry loading products')).toBeTruthy();
    });
  });
});

describe('Empty-state messages', () => {
  it('shows mine-specific empty state when authenticated and filterMode=mine', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    renderWithProviders(<Products />, { withDialog: true });

    // Switch to "My Products" tab once logged in
    await screen.findByText('My Products');
    // There are two "My Products" (tab and welcome banner pill). Press the tab.
    fireEvent.press(screen.getAllByText('My Products')[0]);
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine', page: '1' });
  });

  it('shows a mine-specific empty state with a New Product CTA', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filterMode: 'mine' });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText("You haven't created any products yet. Tap the")).toBeTruthy();
      expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
    });
  });

  it('shows creation prompt when authenticated user has no products', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('No products yet. Start by tapping the')).toBeTruthy();
      expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
    });
  });
});

describe('PaginationControls (desktop web)', () => {
  beforeEach(() => {
    const useIsDesktop = (jest.requireMock('@/hooks/useIsDesktop') as any).useIsDesktop;
    (useIsDesktop as jest.Mock).mockReturnValue(true);
    mockUseProductsQuery.mockReturnValue(pagedQueryResult);
  });

  it('renders pagination buttons on desktop when totalPages > 1', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Previous page')).toBeTruthy();
      expect(screen.getByLabelText('Next page')).toBeTruthy();
    });
  });

  it('shows correct page count text', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 3/)).toBeTruthy();
    });
  });

  it('Previous button is disabled on first page', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      const prev = screen.getByLabelText('Previous page');
      expect(prev.props.accessibilityState?.disabled).toBe(true);
    });
  });

  it('does not render pagination when only 1 page', async () => {
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');
    expect(screen.queryByLabelText('Previous page')).toBeNull();
  });

  it('renders ellipsis for large page counts and allows jumping to a page', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ page: '5' });
    mockUseProductsQuery.mockReturnValue({
      data: {
        items: [
          { id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] },
          { id: 2, name: 'Product B', ownedBy: 'bob', images: [], videos: [] },
        ],
        pages: 10,
        page: 5,
        total: 200,
        size: 20,
      },
      isFetching: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getAllByText('…').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Page 6')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Page 6'));
    expect(mockSetParams).toHaveBeenCalledWith({ page: '6' });
  });
});

describe('Mobile footer', () => {
  beforeEach(() => {
    const useIsDesktop = (jest.requireMock('@/hooks/useIsDesktop') as any).useIsDesktop;
    (useIsDesktop as jest.Mock).mockReturnValue(false);
  });

  it('shows a load more button and advances the page when more results exist', async () => {
    mockUseProductsQuery.mockReturnValue({
      data: {
        items: [
          { id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] },
          { id: 2, name: 'Product B', ownedBy: 'bob', images: [], videos: [] },
        ],
        pages: 3,
        page: 1,
        total: 55,
        size: 20,
      },
      isFetching: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByLabelText('Load more products')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Load more products'));
    expect(mockSetParams).toHaveBeenCalledWith({ page: '2' });
  });

  it('shows the end-of-results footer when there are no more pages', async () => {
    mockUseProductsQuery.mockReturnValue({
      data: {
        items: [{ id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] }],
        pages: 1,
        page: 1,
        total: 1,
        size: 20,
      },
      isFetching: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText(/End of results/)).toBeTruthy();
    });
  });
});
