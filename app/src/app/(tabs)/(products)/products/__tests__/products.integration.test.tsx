import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HttpResponse, http } from 'msw';
import { FlatList } from 'react-native';
import Products from '@/app/(tabs)/(products)/products';
import { API_URL } from '@/config';
import { productsInfiniteQueryOptions } from '@/features/products/queries';
import { mockUser, renderWithProviders, server } from '@/test-utils/index';

const NETWORK_FAILURE_PATTERN = /Network failure/;

const mockUseAuth = jest.fn();
const mockDismissWelcomeCard = jest.fn();
const mockDialogApi = {
  alert: jest.fn(),
  input: jest.fn(),
  toast: jest.fn(),
};
const mockUseDialog = jest.fn(() => ({
  ...mockDialogApi,
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
  // ProductsFab reads useBottomNavVisible() (BOTTOM_NAV_CLEARANCE on web),
  // which calls useSegments() — default it to segments outside the tab group
  // so the fab's bottom offset stays at its base value unless a test opts in.
  useSegments: jest.fn().mockReturnValue([]),
  // useProductSearchShortcut scopes itself to this screen via useFocusEffect;
  // a no-op default keeps the "/" shortcut out of scope for these tests,
  // matching the unit-lane default (see config/setup.unit.ts).
  useFocusEffect: jest.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/features/products/useProductsWelcomeCard', () => {
  const React = require('react');

  return {
    useProductsWelcomeCard: ({
      isAuthenticated,
      currentUser,
    }: {
      isAuthenticated: boolean;
      currentUser?: { preferences?: { products_welcome_dismissed?: boolean } | null } | null;
    }) => {
      const initialVisible = isAuthenticated
        ? currentUser?.preferences?.products_welcome_dismissed !== true
        : true;
      const [showInfoCard, setShowInfoCard] = React.useState(initialVisible);

      React.useEffect(() => {
        setShowInfoCard(initialVisible);
      }, [currentUser, initialVisible, isAuthenticated]);

      const dismissInfoCard = React.useCallback(() => {
        mockDismissWelcomeCard();
        setShowInfoCard(false);
        return Promise.resolve();
      }, []);

      return {
        showInfoCard,
        dismissInfoCard,
      };
    },
  };
});

jest.mock('@/components/base/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
  );
  return {
    ...actual,
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
  // WelcomeCard renders the brand mark via <Image>; both exports must be stubbed.
  return { Image: View, ImageBackground: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LinearGradient: View };
});

jest.mock('@/components/product/ProductCard', () => {
  return function ProductCardMock({ product }: { product: { name: string } }) {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(Text, { testID: 'product-card' }, product.name);
  };
});

jest.mock('@/components/product/ProductCardSkeleton', () => {
  return function ProductCardSkeletonMock() {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(View, { testID: 'product-card-skeleton' });
  };
});

// Controlled query state. Brand/type search stay mocked (they're irrelevant to
// this file's scope); the products list itself now flows through the real
// useInfiniteQuery + productsInfiniteQueryOptions, hitting MSW like the app does.
const mockUseBrandsQuery = jest.fn();
const mockUseProductTypesQuery = jest.fn();
const mockSetParams = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@/features/products/queries', () => {
  const actual = jest.requireActual<typeof import('@/features/products/queries')>(
    '@/features/products/queries',
  );

  return {
    ...actual,
    // Wrapped in jest.fn so tests can inspect call args (e.g. the sort/search
    // params sent through) while still exercising the real fetch pipeline.
    productsInfiniteQueryOptions: jest.fn(actual.productsInfiniteQueryOptions),
    useSearchBrandsQuery: (...args: unknown[]) => mockUseBrandsQuery(...args),
    useSearchProductTypesQuery: (...args: unknown[]) => mockUseProductTypesQuery(...args),
    DEFAULT_PRODUCT_SORT: ['-created_at'],
    PRODUCT_SORT_OPTIONS: [
      { label: 'Relevance', value: [] },
      { label: 'Newest first', value: ['-created_at'] },
      { label: 'Oldest first', value: ['created_at'] },
      { label: 'Name A→Z', value: ['name'] },
      { label: 'Name Z→A', value: ['-name'] },
      { label: 'Brand A→Z', value: ['brand'] },
      { label: 'Brand Z→A', value: ['-brand'] },
    ],
  };
});

const mockProductsInfiniteQueryOptions = jest.mocked(productsInfiniteQueryOptions);

const FILTERS_TOGGLE_PATTERN = /^Filters/;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  jest.clearAllMocks();
  // Wide viewport by default; numColumns only affects grid layout now, not
  // which pagination UI renders (infinite scroll is the same on every width).
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
    width: 1280,
    height: 768,
    scale: 1,
    fontScale: 1,
  });
  mockUseAuth.mockReturnValue({ user: null });
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
    setParams: mockSetParams,
  });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  mockUseBrandsQuery.mockReturnValue({ data: [], isLoading: false });
  mockUseProductTypesQuery.mockReturnValue({ data: [], isLoading: false });
  mockDialogApi.alert.mockReset();
  mockDialogApi.input.mockReset();
  mockDialogApi.toast.mockReset();
  mockDismissWelcomeCard.mockClear();
});

/**
 * MSW handler returning a fixed 3-page catalogue, 2 items/page. `total` (50)
 * must exceed the hook's hardcoded page size (24) twice over so
 * getNextPageParam actually reports a next page after page 1 and page 2 —
 * the real fetched item counts per page don't matter to that check.
 */
function threePageProductsHandler() {
  const itemsByPage: Record<number, { id: number; name: string }[]> = {
    1: [
      { id: 1, name: 'Product A' },
      { id: 2, name: 'Product B' },
    ],
    2: [
      { id: 3, name: 'Product C' },
      { id: 4, name: 'Product D' },
    ],
    3: [{ id: 5, name: 'Product E' }],
  };

  return http.get(`${API_URL}/products`, ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get('page')) || 1;
    return HttpResponse.json({
      items: itemsByPage[page] ?? [],
      total: 50,
      page,
      size: 24,
      pages: 3,
    });
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

function renderProducts() {
  return renderWithProviders(<Products />);
}

/** The sort/filter chips sit behind one toggle; the toggle's name carries the active count. */
function openFilters() {
  fireEvent.press(screen.getByLabelText(FILTERS_TOGGLE_PATTERN));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Products screen', () => {
  it('renders the search bar and the filters toggle, with the chips collapsed', async () => {
    renderProducts();
    expect(screen.getByPlaceholderText('Search products')).toBeOnTheScreen();
    expect(screen.getByLabelText('Filters').props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText('Date')).toBeNull();
    openFilters();
    expect(screen.getByText('Date')).toBeOnTheScreen();
  });

  it('opens the chips and counts them when the URL carries a filter', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '7', brands: 'Bosch' });
    renderProducts();
    expect(screen.getByLabelText('Filters, 2 active').props.accessibilityState.expanded).toBe(true);
    expect(screen.getByText('Last 7d')).toBeOnTheScreen();
  });

  it('shows skeleton rows while loading', async () => {
    renderProducts();
    expect(screen.getAllByTestId('product-card-skeleton').length).toBeGreaterThan(0);
  });

  it('shows empty state when no products match', async () => {
    renderProducts();
    await waitFor(() =>
      expect(
        screen.getByText('No products available yet. Sign in to add your own.'),
      ).toBeOnTheScreen(),
    );
  });

  it('shows search-specific empty state when searching', async () => {
    renderProducts();
    await waitFor(() => expect(screen.queryByTestId('product-card-skeleton')).toBeNull());

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'xyz');
    expect(screen.getByText('No products match your search.')).toBeOnTheScreen();
  });

  it('clears the search query from the URL when the search box is emptied', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'saved query' });
    renderProducts();
    fireEvent.changeText(screen.getByPlaceholderText('Search products'), '');

    expect(mockSetParams).toHaveBeenCalledWith({ q: undefined });
  });

  it('resets page to 1 when sort changes (colocated in onPress)', async () => {
    renderProducts();
    openFilters();

    // Open sort menu and pick a different option
    fireEvent.press(screen.getByLabelText('Sort: Newest first'));
    fireEvent.press(screen.getByText('Oldest first'));

    expect(mockSetParams).toHaveBeenCalledWith({ sort: 'created_at' });
  });

  it('renders welcome banner on first visit', async () => {
    renderProducts();
    expect(screen.getByText('Welcome to Relab')).toBeOnTheScreen();
    expect(
      screen.getByText('Browse products freely. Sign in when you are ready to add your own.'),
    ).toBeOnTheScreen();
  });

  it('dismisses welcome banner when Maybe later is pressed', async () => {
    renderProducts();
    fireEvent.press(screen.getByText('Maybe later'));
    expect(screen.queryByText('Welcome to Relab')).toBeNull();
  });

  it('shows no welcome card to verified users', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();

    expect(screen.queryByText('Got it')).toBeNull();
    expect(screen.queryByTestId('profile-pill-label')).toBeNull();
  });

  it('prompts unverified signed-in users to verify their email', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });

    renderProducts();

    expect(screen.getByText('Verify your email to start creating')).toBeOnTheScreen();
    expect(screen.getByText('Verify email to add product')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-pill-label')).toBeOnTheScreen();
    expect(screen.getByText('Got it')).toBeOnTheScreen();
    expect(screen.getByText('Verify email')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/account');
    });
  });

  it('uses Got it for the dismiss action when signed in but unverified', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });

    renderProducts();

    expect(screen.getByText('Got it')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-pill-label')).toBeOnTheScreen();
  });
});

describe('FAB and new-product flow', () => {
  it('shows sign-in dialog when guest presses the FAB', async () => {
    renderProducts();
    fireEvent.press(screen.getByLabelText('Sign in to add product'));
    expect(mockDialogApi.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign in required' }),
    );
  });

  it('navigates to /products/new when verified user presses FAB', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();
    fireEvent.press(screen.getByLabelText('New product'));
    expect(mockDialogApi.input).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/products/new');
  });

  it('shows email-verification dialog when unverified user presses FAB', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser({ isVerified: false }) });
    renderProducts();
    fireEvent.press(screen.getByLabelText('Verify email to add product'));
    expect(mockDialogApi.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Verify your email first' }),
    );
  });
});

describe('Filter chips and modals', () => {
  it('opens brand filter modal when Brand chip is pressed', async () => {
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Brand'));
    expect(screen.getByText('Filter by brand')).toBeOnTheScreen();
  });

  it('opens product type filter modal when Type chip is pressed', async () => {
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Product type'));
    expect(screen.getByText('Filter by product type')).toBeOnTheScreen();
  });

  it('shows Date chip and opens dropdown menu when pressed', async () => {
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Date'));
    expect(screen.getByText('Last 7d')).toBeOnTheScreen();
    expect(screen.getByText('Last 30d')).toBeOnTheScreen();
    expect(screen.getByText('Last 90d')).toBeOnTheScreen();
  });

  it('activates a date preset when selected from the dropdown menu', async () => {
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Date'));
    fireEvent.press(screen.getByText('Last 7d'));
    expect(mockSetParams).toHaveBeenCalledWith({ days: '7' });
  });

  it('shows the active preset label on the Date chip', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '30' });
    renderProducts();
    expect(screen.getByText('Last 30d')).toBeOnTheScreen();
  });

  it('clears an active date preset via the chip close button', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '7' });
    renderProducts();
    expect(screen.getByText('Last 7d')).toBeOnTheScreen();
    const closeBtn = screen.getByLabelText('Clear Last 7d filter');
    fireEvent.press(closeBtn);
    expect(mockSetParams).toHaveBeenCalledWith({ days: undefined });
  });
});

describe('Error state', () => {
  it('shows error message and retry button on query error', async () => {
    server.use(
      http.get(`${API_URL}/products`, () =>
        HttpResponse.json({ detail: 'Network failure' }, { status: 500 }),
      ),
    );
    renderProducts();
    await waitFor(() => expect(screen.getByText(NETWORK_FAILURE_PATTERN)).toBeOnTheScreen());
    expect(screen.getByLabelText('Retry loading products')).toBeOnTheScreen();
  });
});

describe('Empty-state messages', () => {
  it('shows mine-specific empty state when authenticated and filterMode=mine', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();
    openFilters();

    // Switch to mine filter via the Mine chip
    fireEvent.press(screen.getByText('Mine'));
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine' });
  });

  it('shows a mine-specific empty state with a New product CTA', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filterMode: 'mine' });

    renderProducts();

    await waitFor(() =>
      expect(screen.getByText("You haven't created any products yet. Tap the")).toBeOnTheScreen(),
    );
    expect(screen.getAllByText('New product').length).toBeGreaterThan(0);
  });

  it('shows creation prompt when authenticated user has no products', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();

    await waitFor(() => expect(screen.getByText('No products yet. Tap the')).toBeOnTheScreen());
    expect(screen.getAllByText('New product').length).toBeGreaterThan(0);
  });
});

describe('Infinite scroll', () => {
  it('shows a Load more button when more results exist', async () => {
    server.use(threePageProductsHandler());
    renderProducts();

    await waitFor(() => expect(screen.getByLabelText('Load more products')).toBeOnTheScreen());
    expect(screen.getByText('Product A')).toBeOnTheScreen();
    expect(screen.getByText('Product B')).toBeOnTheScreen();
  });

  // The core regression this task fixes: pressing "Load more" must APPEND the
  // next page's items below the ones already rendered, never replace them.
  it('appends page-2 items below page-1 items when Load more is pressed', async () => {
    server.use(threePageProductsHandler());
    renderProducts();

    await waitFor(() => expect(screen.getByLabelText('Load more products')).toBeOnTheScreen());
    expect(screen.queryByText('Product C')).toBeNull();

    fireEvent.press(screen.getByLabelText('Load more products'));

    await waitFor(() => expect(screen.getByText('Product C')).toBeOnTheScreen());
    // Page-1 items are still there — the new page was appended, not swapped in.
    expect(screen.getByText('Product A')).toBeOnTheScreen();
    expect(screen.getByText('Product B')).toBeOnTheScreen();
    expect(screen.getByText('Product D')).toBeOnTheScreen();
  });

  it('fires onEndReached (scroll-triggered append) instead of only responding to the button', async () => {
    server.use(threePageProductsHandler());
    const { UNSAFE_getByType } = renderProducts();

    await waitFor(() => expect(screen.getByText('Product B')).toBeOnTheScreen());

    const list = UNSAFE_getByType(FlatList);
    expect(list.props.onEndReachedThreshold).toBe(0.5);
    await act(async () => {
      list.props.onEndReached();
    });

    await waitFor(() => expect(screen.getByText('Product C')).toBeOnTheScreen());
    expect(screen.getByText('Product A')).toBeOnTheScreen();
  });

  it('does not touch URL params when loading more — pagination is local to the query', async () => {
    server.use(threePageProductsHandler());
    renderProducts();

    await waitFor(() => expect(screen.getByLabelText('Load more products')).toBeOnTheScreen());
    mockSetParams.mockClear();

    fireEvent.press(screen.getByLabelText('Load more products'));
    await waitFor(() => expect(screen.getByText('Product C')).toBeOnTheScreen());

    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('shows the muted product-count footer and hides Load more once every page loads', async () => {
    server.use(
      http.get(`${API_URL}/products`, () =>
        HttpResponse.json({
          items: [{ id: 1, name: 'Product A' }],
          total: 1,
          page: 1,
          size: 24,
          pages: 1,
        }),
      ),
    );
    renderProducts();

    await waitFor(() => expect(screen.getByText('1 of 1 products')).toBeOnTheScreen());
    expect(screen.queryByLabelText('Load more products')).toBeNull();
  });
});

describe('Mine filter chip', () => {
  it('is not shown for guest users', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderProducts();
    expect(screen.queryByText('Mine')).toBeNull();
  });

  it('is shown for authenticated users', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();
    openFilters();
    expect(screen.getByText('Mine')).toBeOnTheScreen();
  });

  it('sets filterMode=mine when pressed while in all-products mode', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Mine'));
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine' });
  });

  it('clears filterMode when pressed while already in mine mode', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filterMode: 'mine' });
    renderProducts();
    fireEvent.press(screen.getByText('Mine'));
    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'all' });
  });

  it('exposes the active filter to screen readers via accessibilityState.selected', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser() });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filterMode: 'mine' });
    renderProducts();
    expect(screen.getByLabelText('Show all products').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});

describe('Date filter dropdown', () => {
  it('renders a single Date chip instead of multiple preset chips', async () => {
    renderProducts();
    // Individual preset labels are not visible until menu is opened
    expect(screen.queryByText('Last 7d')).toBeNull();
    expect(screen.queryByText('Last 30d')).toBeNull();
    expect(screen.queryByText('Last 90d')).toBeNull();
  });

  it('opens menu with all preset options when the chip is pressed', async () => {
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Date'));
    expect(screen.getByText('Last 7d')).toBeOnTheScreen();
    expect(screen.getByText('Last 30d')).toBeOnTheScreen();
    expect(screen.getByText('Last 90d')).toBeOnTheScreen();
  });

  it('sets days param when a menu option is selected', async () => {
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByText('Date'));
    fireEvent.press(screen.getByText('Last 30d'));
    expect(mockSetParams).toHaveBeenCalledWith({ days: '30' });
  });

  it('shows the active preset label on the chip when days param is set', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ days: '90' });
    renderProducts();
    expect(screen.getByText('Last 90d')).toBeOnTheScreen();
  });
});

describe('Sort — Relevance default when searching', () => {
  it('omits explicit sort when a search query is in the URL', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum' });
    renderProducts();

    await waitFor(() => expect(mockProductsInfiniteQueryOptions).toHaveBeenCalled());
    const sortArgs = mockProductsInfiniteQueryOptions.mock.calls.map((c) => c[2] as string[]);
    expect(sortArgs.some((s) => s.length === 0)).toBe(true);
  });

  it('defaults to newest-first sort when there is no search query', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    renderProducts();

    await waitFor(() => expect(mockProductsInfiniteQueryOptions).toHaveBeenCalled());
    const sortArgs = mockProductsInfiniteQueryOptions.mock.calls.map((c) => c[2] as string[]);
    expect(sortArgs.some((s) => s[0] === '-created_at')).toBe(true);
  });

  it('uses an explicit sort param from URL even when search is active', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum', sort: 'name' });
    renderProducts();

    await waitFor(() => expect(mockProductsInfiniteQueryOptions).toHaveBeenCalled());
    const sortArgs = mockProductsInfiniteQueryOptions.mock.calls.map((c) => c[2] as string[]);
    expect(sortArgs.some((s) => s[0] === 'name')).toBe(true);
  });

  it('shows Relevance option in the sort menu when a search is active', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum' });
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByLabelText('Sort: Relevance'));
    // The chip itself reads "Relevance"; the second match is the menu item.
    expect(screen.getAllByText('Relevance')).toHaveLength(2);
  });

  it('hides Relevance option in the sort menu when there is no search', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByLabelText('Sort: Newest first'));
    expect(screen.queryByText('Relevance')).toBeNull();
  });

  it('clears explicit sort when Relevance is selected from the sort menu', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ q: 'aluminum' });
    renderProducts();
    openFilters();
    fireEvent.press(screen.getByLabelText('Sort: Relevance'));
    fireEvent.press(screen.getAllByText('Relevance')[1]);
    expect(mockSetParams).toHaveBeenCalledWith({ sort: undefined });
  }, 15_000);
});
