import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProductsScreen } from '@/hooks/products/useProductsScreen';
import { productsQueryOptions } from '@/hooks/useProductQueries';

let mockSearchParams: Record<string, string> = {};
const mockSetParams: jest.Mock = jest.fn();
const mockPush: jest.Mock = jest.fn();
const mockAlert: jest.Mock = jest.fn();
const mockInput: jest.Mock = jest.fn();
const mockSetLocalItem: jest.Mock = jest.fn();
const mockGetLocalItem: jest.Mock = jest.fn();
const mockRefetchUser: jest.Mock = jest.fn();
const mockSetNewProductIntent: jest.Mock = jest.fn();
const mockRouter = {
  setParams: mockSetParams,
  push: mockPush,
};
const mockProductsQueryResult = {
  data: { items: [], page: 1, pages: 1, total: 0 },
  isFetching: false,
  isLoading: false,
  error: null,
  refetch: jest.fn(async () => undefined),
};
const mockAuthState = {
  user: null,
  refetch: mockRefetchUser,
};

jest.mock('@tanstack/react-query', () => ({
  useQueries: () => [mockProductsQueryResult],
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
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

jest.mock('@/hooks/useProductQueries', () => ({
  DEFAULT_PRODUCT_SORT: ['-created_at'],
  PRODUCT_SORT_OPTIONS: [
    { label: 'Relevance', value: ['rank'] },
    { label: 'Newest first', value: ['-created_at'] },
    { label: 'Oldest first', value: ['created_at'] },
  ],
  productsQueryOptions: jest.fn(() => ({})),
  useSearchBrandsQuery: () => ({ data: [], isLoading: false }),
  useSearchProductTypesQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn(),
}));

jest.mock('@/services/newProductStore', () => ({
  setNewProductIntent: (...args: unknown[]) => mockSetNewProductIntent(...args),
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
    const hook = renderHook(() => useProductsScreen(3));

    await act(async () => {
      await Promise.resolve();
    });

    return hook;
  }

  it('syncs debounced search text back to the URL and resets pagination', async () => {
    const { result } = await renderUseProductsScreen();

    act(() => {
      result.current.search.setQuery('laptop');
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({ q: 'laptop', page: '1' });
    });
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
        title: 'Sign In Required',
      }),
    );
    expect(mockInput).not.toHaveBeenCalled();
    expect(mockSetNewProductIntent).not.toHaveBeenCalled();
  });

  it('returns grouped screen, search, filters, list, and action domains', async () => {
    const { result } = await renderUseProductsScreen();

    expect(result.current.screen.filterMode).toBe('all');
    expect(result.current.search.query).toBe('');
    expect(result.current.filters.brandResults).toEqual([]);
    expect(result.current.list.productList).toEqual([]);
    expect(typeof result.current.actions.createProduct).toBe('function');
  });

  it('applies filter and pagination actions through named handlers', async () => {
    const { result } = await renderUseProductsScreen();

    act(() => {
      result.current.filters.toggleMine();
      result.current.filters.applyBrandSelection(['Apple', 'Dell']);
      result.current.list.setPage(3);
    });

    expect(mockSetParams).toHaveBeenCalledWith({ filterMode: 'mine', page: '1' });
    expect(mockSetParams).toHaveBeenCalledWith({ brands: 'Apple,Dell', page: '1' });
    expect(mockSetParams).toHaveBeenCalledWith({ page: '3' });
  });

  describe('date preset filter', () => {
    beforeEach(() => {
      jest.setSystemTime(new Date('2026-04-23T14:30:45.123Z'));
    });

    it('passes createdAfter truncated to UTC midnight for the given day count', async () => {
      mockSearchParams = { days: '30' };
      await renderUseProductsScreen();

      const calls = jest.mocked(productsQueryOptions).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const { createdAfter } = calls[0][4] as { createdAfter: Date };
      expect(createdAfter).toBeInstanceOf(Date);
      expect(createdAfter.toISOString()).toBe('2026-03-24T00:00:00.000Z');
    });

    it('omits createdAfter when no days preset is active', async () => {
      await renderUseProductsScreen();

      const calls = jest.mocked(productsQueryOptions).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect((calls[0][4] as { createdAfter?: Date }).createdAfter).toBeUndefined();
    });

    it('passes the same createdAfter ISO string on re-renders without a preset change', async () => {
      mockSearchParams = { days: '7' };
      const { rerender } = await renderUseProductsScreen();

      const mockedFn = jest.mocked(productsQueryOptions);
      const firstIso = (
        mockedFn.mock.calls[0][4] as { createdAfter: Date }
      ).createdAfter.toISOString();

      jest.advanceTimersByTime(500);
      rerender({});

      const lastIso = (
        mockedFn.mock.calls[mockedFn.mock.calls.length - 1][4] as { createdAfter: Date }
      ).createdAfter.toISOString();
      expect(lastIso).toBe(firstIso);
    });
  });
});
