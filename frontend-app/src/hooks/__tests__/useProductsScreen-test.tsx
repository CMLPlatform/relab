import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProductsScreen } from '@/hooks/useProductsScreen';

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
  refetch: jest.fn(),
};
const mockAuthState = {
  user: null,
  refetch: mockRefetchUser,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/components/common/DialogProvider', () => ({
  useDialog: () => ({
    alert: mockAlert,
    input: mockInput,
  }),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/hooks/useProductQueries', () => ({
  DEFAULT_PRODUCT_SORT: ['-created_at'],
  PRODUCT_SORT_OPTIONS: [
    { label: 'Relevance', value: ['rank'] },
    { label: 'Newest first', value: ['-created_at'] },
    { label: 'Oldest first', value: ['created_at'] },
  ],
  useProductsQuery: () => mockProductsQueryResult,
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
      result.current.setSearchQuery('laptop');
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({ q: 'laptop', page: '1' });
    });
  });

  it('stores the guest info-card dismissal locally', async () => {
    const { result } = await renderUseProductsScreen();

    await act(async () => {
      await result.current.dismissInfoCard();
    });

    expect(mockSetLocalItem).toHaveBeenCalledWith('products_info_card_dismissed_guest', 'true');
  });

  it('prompts guests to sign in before creating a product', async () => {
    const { result } = await renderUseProductsScreen();

    act(() => {
      result.current.newProduct();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sign In Required',
      }),
    );
    expect(mockInput).not.toHaveBeenCalled();
    expect(mockSetNewProductIntent).not.toHaveBeenCalled();
  });
});
