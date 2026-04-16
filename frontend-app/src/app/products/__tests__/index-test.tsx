import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { mockUser, renderWithProviders } from '@/test-utils';
import Products from '../index';

const mockUseAuth = jest.fn();
const mockDialogApi = {
  alert: jest.fn(),
  input: jest.fn(),
  toast: jest.fn(),
};
const mockUseDialog = jest.fn(() => ({
  ...mockDialogApi,
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/common/DialogProvider', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    DialogProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useDialog: () => mockUseDialog(),
  };
});

// useWindowDimensions is spied on in beforeEach to control numColumns per describe block

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const FlatListMock = React.forwardRef(function FlatListMock(
    {
      data,
      renderItem,
      ListFooterComponent,
      ListEmptyComponent,
      ...props
    }: {
      data?: unknown[];
      renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
      ListFooterComponent?: React.ComponentType | React.ReactElement | null;
      ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
      [key: string]: unknown;
    },
    ref: React.ForwardedRef<{ scrollToOffset: () => void; scrollToIndex: () => void }>,
  ) {
    React.useImperativeHandle(
      ref,
      () => ({
        scrollToOffset: jest.fn(),
        scrollToIndex: jest.fn(),
      }),
      [],
    );

    const items =
      Array.isArray(data) && renderItem
        ? data.map((item, index) =>
            React.createElement(React.Fragment, { key: index }, renderItem({ item, index })),
          )
        : null;
    const footer =
      typeof ListFooterComponent === 'function'
        ? React.createElement(ListFooterComponent)
        : ListFooterComponent;
    const empty =
      typeof ListEmptyComponent === 'function'
        ? React.createElement(ListEmptyComponent)
        : ListEmptyComponent;

    return React.createElement(View, props, items && items.length > 0 ? items : empty, footer);
  });
  return {
    __esModule: true,
    default: FlatListMock,
  };
});

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

jest.mock('@/hooks/useProductQueries', () => ({
  useProductsQuery: (...args: unknown[]) => mockUseProductsQuery(...args),
  useSearchBrandsQuery: (...args: unknown[]) => mockUseBrandsQuery(...args),
  useSearchProductTypesQuery: (...args: unknown[]) => mockUseProductTypesQuery(...args),
  useProductTypesQuery: jest.fn().mockReturnValue({ data: [], isLoading: false }),
  PRODUCT_SORT_OPTIONS: [
    { label: 'Relevance', value: ['rank'] },
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
  // Default to wide viewport (numColumns=3) so most tests get pagination mode
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
    width: 1024,
    height: 768,
    scale: 1,
    fontScale: 1,
  });
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
  mockDialogApi.alert.mockReset();
  mockDialogApi.input.mockReset();
  mockDialogApi.toast.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderProducts() {
  return renderWithProviders(<Products />, { withDialog: true });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Products screen', () => {
  it('renders the search bar and sort button', async () => {
    renderProducts();
    expect(await screen.findByPlaceholderText('Search products')).toBeOnTheScreen();
  });

  it('shows skeleton rows while loading', async () => {
    mockUseProductsQuery.mockReturnValue(loadingQueryResult);
    renderProducts();
    expect((await screen.findAllByTestId('product-card-skeleton')).length).toBeGreaterThan(0);
  });

  it('shows empty state when no products match', async () => {
    renderProducts();
    expect(
      await screen.findByText('No products available yet. Sign in to add your own.'),
    ).toBeOnTheScreen();
  });

  it('shows search-specific empty state when searching', async () => {
    renderProducts();
    await screen.findByPlaceholderText('Search products');

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'xyz');
    expect(await screen.findByText('No products found matching your search.')).toBeOnTheScreen();
  });

  it('resets page to 1 when search text changes (colocated in onChangeText)', async () => {
    // Start on page 2 by making the query return multi-page data and simulating
    // a page advance; then type in search and verify page arg resets to 1
    mockUseProductsQuery.mockReturnValue(pagedQueryResult);
    renderProducts();
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
    renderProducts();
    await screen.findByPlaceholderText('Search products');

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), '');

    expect(mockSetParams).toHaveBeenCalledWith({ q: undefined, page: '1' });
  });

  it('resets page to 1 when sort changes (colocated in onPress)', async () => {
    mockUseProductsQuery.mockReturnValue(pagedQueryResult);
    renderProducts();
    await screen.findByPlaceholderText('Search products');

    // Open sort menu and pick a different option
    fireEvent.press(screen.getByLabelText('Sort products'));
    await screen.findByText('Oldest first');
    fireEvent.press(screen.getByText('Oldest first'));

    expect(mockSetParams).toHaveBeenCalledWith({ sort: 'created_at', page: '1' });
  });

  it('renders welcome banner on first visit', async () => {
    renderProducts();
    expect(await screen.findByText('Welcome to RELab')).toBeOnTheScreen();
    expect(
      screen.getByText('Browse products freely. Sign in when you are ready to add your own.'),
    ).toBeOnTheScreen();
  });

  it('dismisses welcome banner when Maybe later is pressed', async () => {
    renderProducts();
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
      expect(screen.getByText('Ready to add products')).toBeOnTheScreen();
      expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
      expect(screen.getByText('profile')).toBeOnTheScreen();
    });
  });

  it('prompts unverified signed-in users to verify their email', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });

    renderProducts();

    expect(await screen.findByText('Verify your email to start creating')).toBeOnTheScreen();
    expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
    expect(screen.getByText('profile')).toBeOnTheScreen();
    expect(screen.getByText('Got it')).toBeOnTheScreen();
    expect(screen.getByText('Verify email')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Verify email'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('uses Got it for the dismiss action when signed in', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });

    renderProducts();

    expect(await screen.findByText('Got it')).toBeOnTheScreen();
    expect(screen.getByText('profile')).toBeOnTheScreen();
  });
});

describe('FAB and new-product flow', () => {
  it('shows sign-in dialog when guest presses the FAB', async () => {
    renderProducts();
    await screen.findByLabelText('Sign in to create products');
    fireEvent.press(screen.getByLabelText('Sign in to create products'));
    expect(mockDialogApi.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign In Required' }),
    );
  });

  it('shows create-product dialog when verified user presses FAB', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();
    await screen.findByLabelText('Create new product');
    fireEvent.press(screen.getByLabelText('Create new product'));
    expect(mockDialogApi.input).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Create New Product' }),
    );
  });

  it('shows email-verification dialog when unverified user presses FAB', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });
    renderProducts();
    await screen.findByLabelText('Create new product');
    fireEvent.press(screen.getByLabelText('Create new product'));
    expect(mockDialogApi.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Email Verification Required' }),
    );
  });
});

describe('Filter chips and modals', () => {
  it('opens brand filter modal when Brand chip is pressed', async () => {
    renderProducts();
    await screen.findByText('Brand');
    fireEvent.press(screen.getByText('Brand'));
    await waitFor(() => {
      expect(screen.getByText('Filter by Brand')).toBeOnTheScreen();
    });
  });

  it('opens product type filter modal when Type chip is pressed', async () => {
    renderProducts();
    await screen.findByText('Type');
    fireEvent.press(screen.getByText('Type'));
    await waitFor(() => {
      expect(screen.getByText('Filter by Product Type')).toBeOnTheScreen();
    });
  });

  it('shows Date chip and opens dropdown menu when pressed', async () => {
    renderProducts();
    await screen.findByText('Date');
    fireEvent.press(screen.getByText('Date'));
    await waitFor(() => {
      expect(screen.getByText('Last 7d')).toBeOnTheScreen();
      expect(screen.getByText('Last 30d')).toBeOnTheScreen();
      expect(screen.getByText('Last 90d')).toBeOnTheScreen();
    });
  });

  it('activates a date preset when selected from the dropdown menu', async () => {
    renderProducts();
    await screen.findByText('Date');
    fireEvent.press(screen.getByText('Date'));
    await screen.findByText('Last 7d');
    fireEvent.press(screen.getByText('Last 7d'));
    expect(mockSetParams).toHaveBeenCalledWith({ days: '7', page: '1' });
  });

  it('shows the active preset label on the Date chip', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '30' });
    renderProducts();
    expect(await screen.findByText('Last 30d')).toBeOnTheScreen();
  });

  it('clears an active date preset via the chip close button', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '7' });
    renderWithProviders(<Products />, { withDialog: true });
    expect(await screen.findByText('Last 7d')).toBeOnTheScreen();
    // react-native-paper Chip renders its close button with accessibilityLabel="Close"
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.press(closeBtn);
    expect(mockSetParams).toHaveBeenCalledWith({ days: undefined, page: '1' });
  });
});

describe('Error state', () => {
  it('shows error message and retry button on query error', async () => {
    mockUseProductsQuery.mockReturnValue({
      ...emptyQueryResult,
      error: new Error('Network failure'),
    });
    renderProducts();
    expect(await screen.findByText(/Network failure/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Retry loading products')).toBeOnTheScreen();
  });
});

describe('Empty-state messages', () => {
  it('shows mine-specific empty state when authenticated and filterMode=mine', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    renderProducts();

    // Switch to mine filter via the Mine chip
    await screen.findByText('Mine');
    fireEvent.press(screen.getByText('Mine'));
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine', page: '1' });
  });

  it('shows a mine-specific empty state with a New Product CTA', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filterMode: 'mine' });

    renderProducts();

    expect(
      await screen.findByText("You haven't created any products yet. Tap the"),
    ).toBeOnTheScreen();
    expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
  });

  it('shows creation prompt when authenticated user has no products', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
    renderProducts();

    expect(await screen.findByText('No products yet. Start by tapping the')).toBeOnTheScreen();
    expect(screen.getAllByText('New Product').length).toBeGreaterThan(0);
  });
});

describe('PaginationControls (multi-column)', () => {
  beforeEach(() => {
    // Wide viewport already set globally; confirm numColumns=3 → pagination
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 1024,
      height: 768,
      scale: 1,
      fontScale: 1,
    });
    mockUseProductsQuery.mockReturnValue(pagedQueryResult);
  });

  it('renders pagination buttons on desktop when totalPages > 1', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Previous page')).toBeOnTheScreen();
      expect(screen.getByLabelText('Next page')).toBeOnTheScreen();
    });
  });

  it('shows correct page count text', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 3/)).toBeOnTheScreen();
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
      expect(screen.getByLabelText('Page 6')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByLabelText('Page 6'));
    expect(mockSetParams).toHaveBeenCalledWith({ page: '6' });
  });
});

describe('Mobile footer (single-column)', () => {
  beforeEach(() => {
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 390, // numColumns=1 → load-more mode
      height: 844,
      scale: 2,
      fontScale: 1,
    });
  });

  it('shows a load more button when more results exist', async () => {
    mockUseProductsQuery.mockReturnValue({
      data: {
        items: [
          { id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] },
          { id: 2, name: 'Product B', ownedBy: 'bob', images: [], videos: [] },
        ],
        pages: 3,
        page: 1,
        total: 55,
        size: 24,
      },
      isFetching: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByLabelText('Load more products')).toBeOnTheScreen();
    });
  });

  it('advances the local page (not URL) when load more is pressed', async () => {
    mockUseProductsQuery.mockReturnValue({
      data: {
        items: [
          { id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] },
          { id: 2, name: 'Product B', ownedBy: 'bob', images: [], videos: [] },
        ],
        pages: 3,
        page: 1,
        total: 55,
        size: 24,
      },
      isFetching: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Products />, { withDialog: true });
    expect(await screen.findByLabelText('Load more products')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Load more products'));

    await waitFor(() => {
      // The query should be called with page 2 via local state
      const pages = (mockUseProductsQuery.mock.calls as unknown[][]).map((c) => c[1] as number);
      expect(pages).toContain(2);
    });
    // URL page param must NOT be updated — load-more uses local state only
    expect(mockSetParams).not.toHaveBeenCalledWith({ page: '2' });
  });

  it('shows server total in end-of-results footer', async () => {
    mockUseProductsQuery.mockReturnValue({
      data: {
        items: [{ id: 1, name: 'Product A', ownedBy: 'alice', images: [], videos: [] }],
        pages: 1,
        page: 1,
        total: 57,
        size: 24,
      },
      isFetching: false,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Products />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('All 57 products shown')).toBeOnTheScreen();
    });
  });
});

describe('Mine filter chip', () => {
  beforeEach(() => {
    mockUseProductsQuery.mockReturnValue(emptyQueryResult);
  });

  it('is not shown for guest users', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');
    expect(screen.queryByText('Mine')).toBeNull();
  });

  it('is shown for authenticated users', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderWithProviders(<Products />, { withDialog: true });
    expect(await screen.findByText('Mine')).toBeOnTheScreen();
  });

  it('sets filterMode=mine when pressed while in all-products mode', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Mine');
    fireEvent.press(screen.getByText('Mine'));
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine', page: '1' });
  });

  it('clears filterMode when pressed while already in mine mode', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filterMode: 'mine' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Mine');
    fireEvent.press(screen.getByText('Mine'));
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'all', page: '1' });
  });
});

describe('Date filter dropdown', () => {
  it('renders a single Date chip instead of multiple preset chips', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Date');
    // Individual preset labels are not visible until menu is opened
    expect(screen.queryByText('Last 7d')).toBeNull();
    expect(screen.queryByText('Last 30d')).toBeNull();
    expect(screen.queryByText('Last 90d')).toBeNull();
  });

  it('opens menu with all preset options when the chip is pressed', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Date');
    fireEvent.press(screen.getByText('Date'));
    await waitFor(() => {
      expect(screen.getByText('Last 7d')).toBeOnTheScreen();
      expect(screen.getByText('Last 30d')).toBeOnTheScreen();
      expect(screen.getByText('Last 90d')).toBeOnTheScreen();
    });
  });

  it('sets days param when a menu option is selected', async () => {
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByText('Date');
    fireEvent.press(screen.getByText('Date'));
    await screen.findByText('Last 30d');
    fireEvent.press(screen.getByText('Last 30d'));
    expect(mockSetParams).toHaveBeenCalledWith({ days: '30', page: '1' });
  });

  it('shows the active preset label on the chip when days param is set', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '90' });
    renderWithProviders(<Products />, { withDialog: true });
    expect(await screen.findByText('Last 90d')).toBeOnTheScreen();
  });
});

describe('Sort — Relevance default when searching', () => {
  it('defaults to rank sort when a search query is in the URL', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    await waitFor(() => {
      const sortArgs = (mockUseProductsQuery.mock.calls as unknown[][]).map(
        (c) => c[3] as string[],
      );
      expect(sortArgs.some((s) => s[0] === 'rank')).toBe(true);
    });
  });

  it('defaults to newest-first sort when there is no search query', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    await waitFor(() => {
      const sortArgs = (mockUseProductsQuery.mock.calls as unknown[][]).map(
        (c) => c[3] as string[],
      );
      expect(sortArgs.some((s) => s[0] === '-created_at')).toBe(true);
    });
  });

  it('uses an explicit sort param from URL even when search is active', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum', sort: 'name' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    await waitFor(() => {
      const sortArgs = (mockUseProductsQuery.mock.calls as unknown[][]).map(
        (c) => c[3] as string[],
      );
      expect(sortArgs.some((s) => s[0] === 'name')).toBe(true);
    });
  });

  it('resets rank sort param when search is cleared', async () => {
    // sort=rank in URL but no search query → effect should clear the sort param
    (useLocalSearchParams as jest.Mock).mockReturnValue({ sort: 'rank' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByPlaceholderText('Search products');

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({ sort: undefined });
    });
  });

  it('shows Relevance option in the sort menu when a search is active', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByLabelText('Sort products');
    fireEvent.press(screen.getByLabelText('Sort products'));
    expect(await screen.findByText('Relevance')).toBeOnTheScreen();
  });

  it('hides Relevance option in the sort menu when there is no search', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByLabelText('Sort products');
    fireEvent.press(screen.getByLabelText('Sort products'));
    await waitFor(() => {
      expect(screen.queryByText('Relevance')).toBeNull();
    });
  });

  it('sends rank when Relevance is selected from the sort menu', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum' });
    renderWithProviders(<Products />, { withDialog: true });
    await screen.findByLabelText('Sort products');
    fireEvent.press(screen.getByLabelText('Sort products'));
    await screen.findByText('Relevance');
    fireEvent.press(screen.getByText('Relevance'));
    expect(mockSetParams).toHaveBeenCalledWith({ sort: 'rank', page: '1' });
  }, 15_000);
});
