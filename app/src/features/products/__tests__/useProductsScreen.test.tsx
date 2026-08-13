import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { productsInfiniteQueryOptions } from '@/features/products/queries';
import { useProductsScreen } from '@/features/products/useProductsScreen';
import { FILTER_CSV_SEPARATOR } from '@/services/api/products';

let mockSearchParams: Record<string, string> = {};
const mockSetParams: jest.Mock = jest.fn();
const mockPush: jest.Mock = jest.fn();
const mockAlert: jest.Mock = jest.fn();
const mockInput: jest.Mock = jest.fn();
const mockSetLocalItem: jest.Mock = jest.fn();
const mockGetLocalItem: jest.Mock = jest.fn();
const mockRefetchUser: jest.Mock = jest.fn();
const mockFetchNextPage: jest.Mock = jest.fn();
const mockRouter = {
  setParams: mockSetParams,
  push: mockPush,
};
const mockProductsQueryResult = {
  data: { pages: [{ items: [], page: 1, pages: 1, total: 0, size: 24 }], pageParams: [1] },
  isFetching: false,
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: mockFetchNextPage,
  error: null,
  refetch: jest.fn(async () => undefined),
};
const mockAuthState = {
  user: null,
  refetch: mockRefetchUser,
};

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => mockProductsQueryResult,
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/base/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
  );
  return {
    ...actual,
    useDialog: () => ({
      alert: mockAlert,
      input: mockInput,
    }),
  };
});

jest.mock('@/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/features/products/queries', () => ({
  DEFAULT_PRODUCT_SORT: ['-created_at'],
  PRODUCT_SORT_OPTIONS: [
    { label: 'Relevance', value: [] },
    { label: 'Newest first', value: ['-created_at'] },
    { label: 'Oldest first', value: ['created_at'] },
  ],
  productsInfiniteQueryOptions: jest.fn(() => ({})),
  useSearchBrandsQuery: () => ({ data: [], isLoading: false }),
  useSearchProductTypesQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/services/api/auth/authentication', () => ({
  updateUser: jest.fn(),
}));

jest.mock('@/services/storage', () => ({
  getLocalItem: (...args: unknown[]) => mockGetLocalItem(...args),
  setLocalItem: (...args: unknown[]) => mockSetLocalItem(...args),
}));

describe('useProductsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockGetLocalItem.mockImplementation(async () => null);
    mockSetLocalItem.mockImplementation(async () => undefined);
  });

  async function renderUseProductsScreen() {
    const hook = renderHook(() => useProductsScreen());

    await act(async () => {
      await Promise.resolve();
    });

    return hook;
  }

  it('syncs debounced search text back to the URL', async () => {
    const { result } = await renderUseProductsScreen();

    act(() => {
      result.current.search.setQuery('laptop');
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({ q: 'laptop' });
    });
  });

  it('re-syncs the toolbar to an external URL query without clobbering it back', async () => {
    const { result, rerender } = await renderUseProductsScreen();

    // User types; it settles into the URL.
    act(() => {
      result.current.search.setQuery('laptop');
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({ q: 'laptop' });
    });
    mockSearchParams = { q: 'laptop' };
    rerender({});
    mockSetParams.mockClear();

    // External navigation (browser back/forward) points ?q= somewhere else.
    mockSearchParams = { q: 'phone' };
    rerender({});

    // The toolbar reflects the external query...
    expect(result.current.search.query).toBe('phone');

    // ...and the settling debounce must not write the stale 'laptop' back.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const clobbered = mockSetParams.mock.calls.some(
      ([params]) => (params as { q?: string }).q === 'laptop',
    );
    expect(clobbered).toBe(false);

    mockSearchParams = {};
  });

  it('stores the guest info-card dismissal locally', async () => {
    const { result } = await renderUseProductsScreen();

    await act(async () => {
      await result.current.actions.dismissWelcomeCard();
    });

    expect(mockSetLocalItem).toHaveBeenCalledWith('products_info_card_dismissed_guest', 'true');
  });

  it('prompts guests to sign in before creating a product', async () => {
    const { result } = await renderUseProductsScreen();

    act(() => {
      result.current.actions.createProduct();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sign in required',
      }),
    );
    expect(mockInput).not.toHaveBeenCalled();
  });

  it('returns grouped screen, search, filters, list, and action domains', async () => {
    const { result } = await renderUseProductsScreen();

    expect(result.current.screen.filterMode).toBe('all');
    expect(result.current.search.query).toBe('');
    expect(result.current.filters.brandResults).toEqual([]);
    expect(result.current.list.products).toEqual([]);
    expect(typeof result.current.actions.createProduct).toBe('function');
  });

  it('exposes the flattened pages and infinite-query controls on list', async () => {
    const { result } = await renderUseProductsScreen();

    expect(result.current.list.total).toBe(0);
    expect(result.current.list.hasNextPage).toBe(false);
    expect(result.current.list.isFetchingNextPage).toBe(false);
    expect(typeof result.current.list.fetchNextPage).toBe('function');

    act(() => {
      result.current.list.fetchNextPage();
    });
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('applies filter actions through named handlers', async () => {
    const { result } = await renderUseProductsScreen();

    act(() => {
      result.current.filters.toggleMine();
      result.current.filters.applyBrandSelection(['Apple', 'Dell']);
    });

    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine' });
    expect(mockSetParams).toHaveBeenCalledWith({
      brands: `Apple${FILTER_CSV_SEPARATOR}Dell`,
    });
  });

  describe('date preset filter', () => {
    beforeEach(() => {
      jest.setSystemTime(new Date('2026-04-23T14:30:45.123Z'));
    });

    it('passes createdAfter truncated to UTC midnight for the given day count', async () => {
      mockSearchParams = { days: '30' };
      await renderUseProductsScreen();

      const calls = jest.mocked(productsInfiniteQueryOptions).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const { createdAfter } = calls[0][3] as { createdAfter: Date };
      expect(createdAfter).toBeInstanceOf(Date);
      expect(createdAfter.toISOString()).toBe('2026-03-24T00:00:00.000Z');
    });

    it('omits createdAfter when no days preset is active', async () => {
      await renderUseProductsScreen();

      const calls = jest.mocked(productsInfiniteQueryOptions).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect((calls[0][3] as { createdAfter?: Date }).createdAfter).toBeUndefined();
    });

    it('passes the same createdAfter ISO string on re-renders without a preset change', async () => {
      mockSearchParams = { days: '7' };
      const { rerender } = await renderUseProductsScreen();

      const mockedFn = jest.mocked(productsInfiniteQueryOptions);
      const firstIso = (
        mockedFn.mock.calls[0][3] as { createdAfter: Date }
      ).createdAfter.toISOString();

      jest.advanceTimersByTime(500);
      rerender({});

      const lastIso = (
        mockedFn.mock.calls[mockedFn.mock.calls.length - 1][3] as { createdAfter: Date }
      ).createdAfter.toISOString();
      expect(lastIso).toBe(firstIso);
    });
  });
});
