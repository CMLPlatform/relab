import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useProductPageScreen } from '@/features/products/useProductPageScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetOptions = jest.fn();
const mockDispatch = jest.fn();
const mockAddListener = jest.fn((_eventName: string, _listener: unknown) => jest.fn());
const mockAlert = jest.fn();
const mockFeedbackAlert = jest.fn();
const mockUseProductForm = jest.fn();
const mockUseProductQuery = jest.fn();
const mockUseAncestorTrail = jest.fn();
let beforeRemoveListener:
  | ((event: { preventDefault: () => void; data: { action: { type: string } } }) => void)
  | undefined;

jest.mock('expo-router', () => ({
  // No-op like the unit lane's auto-mock: the edit-mode keyboard shortcuts
  // (useProductEditShortcuts) are covered by their own test.
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: '42' }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useNavigation: () => ({
    setOptions: mockSetOptions,
    addListener: mockAddListener,
    dispatch: mockDispatch,
  }),
}));

jest.mock('@/components/base/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
  );
  return {
    ...actual,
    useDialog: () => ({
      alert: mockAlert,
      input: jest.fn(),
    }),
  };
});

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    alert: mockFeedbackAlert,
    error: jest.fn(),
  }),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: {
      oauth_accounts: [{ oauth_name: 'google' }],
    },
  }),
}));

jest.mock('@/context/streamSession', () => ({
  useStreamSession: () => ({
    activeStream: { productId: 99, productName: 'Stream Product' },
  }),
}));

jest.mock('@/features/cameras/rpi/useRpiIntegration', () => ({
  useRpiIntegration: () => ({ enabled: true }),
}));

jest.mock('@/features/cameras/youtube/useYouTubeIntegration', () => ({
  useYouTubeIntegration: () => ({ enabled: true }),
}));

jest.mock('@/features/products/useProductForm', () => ({
  useProductForm: (...args: unknown[]) => mockUseProductForm(...args),
}));

jest.mock('@/features/products/queries', () => ({
  useBaseProductQuery: (...args: unknown[]) => mockUseProductQuery(...args),
  useComponentQuery: (...args: unknown[]) => mockUseProductQuery(...args),
}));

jest.mock('@/features/products/useAncestorTrail', () => ({
  useAncestorTrail: (...args: unknown[]) => mockUseAncestorTrail(...args),
}));

const baseProduct = {
  id: 42,
  name: 'Desk Radio',
  parentID: undefined,
  ownedBy: 'me',
};

const baseFormReturn = {
  product: baseProduct,
  serverProduct: baseProduct,
  editMode: false,
  isDirty: false,
  isProductComponent: false,
  validationResult: { isValid: true, error: '' },
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  isSaving: false,
  isPaused: false,
  justSaved: false,
  onProductNameChange: jest.fn(),
  onChangeDescription: jest.fn(),
  onChangePhysicalProperties: jest.fn(),
  onChangeCircularityProperties: jest.fn(),
  onBrandChange: jest.fn(),
  onModelChange: jest.fn(),
  onTypeChange: jest.fn(),
  onImagesChange: jest.fn(),
  onAmountInParentChange: jest.fn(),
  onVideoChange: jest.fn(),
  saveAndExit: jest.fn(),
  onProductDelete: jest.fn(),
};

describe('useProductPageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    beforeRemoveListener = undefined;
    mockAddListener.mockImplementation((eventName: string, listener: unknown) => {
      if (eventName === 'beforeRemove') {
        beforeRemoveListener = listener as typeof beforeRemoveListener;
      }
      return jest.fn();
    });
    mockUseProductQuery.mockReturnValue({ data: undefined });
    mockUseAncestorTrail.mockReturnValue({ ancestors: [], isLoading: false });
    mockUseProductForm.mockReturnValue(baseFormReturn);
  });

  it('returns grouped screen, editing, streaming, capabilities, and actions domains', async () => {
    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    expect(result.current.screen.product).toEqual(baseProduct);
    expect(result.current.editing.editMode).toBe(false);
    expect(result.current.streaming.streamingOtherProduct).toBe(true);
    expect(result.current.capabilities.ownedByMe).toBe(true);
    expect(typeof result.current.actions.saveAndExit).toBe('function');
  });

  it('opens and closes the stream picker through named actions', async () => {
    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    expect(result.current.streaming.streamPickerVisible).toBe(false);

    await act(() => {
      result.current.streaming.openStreamPicker();
    });
    expect(result.current.streaming.streamPickerVisible).toBe(true);

    await act(() => {
      result.current.streaming.closeStreamPicker();
    });
    expect(result.current.streaming.streamPickerVisible).toBe(false);
  });

  it('navigates back immediately when not editing', async () => {
    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('prompts before navigating back when editing', async () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: true,
    });

    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Discard changes?',
      }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates back without a discard prompt when editing with no unsaved changes', async () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: false,
    });

    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('uses the component parent role when navigating back before ancestor crumbs load', async () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      product: {
        ...baseProduct,
        role: 'component',
        parentID: 17,
        parentRole: 'component',
      },
      serverProduct: {
        ...baseProduct,
        role: 'component',
        parentID: 17,
        parentRole: 'component',
      },
      isProductComponent: true,
    });
    mockUseAncestorTrail.mockReturnValueOnce({ ancestors: [], isLoading: true });

    const { result } = await renderHook(() => useProductPageScreen({ role: 'component' }));

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/components/[id]',
      params: { id: '17' },
    });
  });

  it('defers back navigation until the record loads, instead of reading the loading sentinel', async () => {
    // useProductForm seeds a blank `newProduct()` while the query is in flight,
    // and that sentinel's role is 'product' with no parentID — indistinguishable
    // from a real top-level product. Pressing back in that window used to
    // replace to '/products', stranding a component's user on the list instead
    // of its parent.
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product: { ...baseProduct, id: undefined, parentID: undefined },
      serverProduct: undefined,
      isProductComponent: false,
      isLoading: true,
    });

    const { result, rerender } = await renderHook(() =>
      useProductPageScreen({ role: 'component' }),
    );

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).not.toHaveBeenCalled();

    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product: { ...baseProduct, role: 'component', parentID: 17, parentRole: 'product' },
      serverProduct: { ...baseProduct, role: 'component', parentID: 17, parentRole: 'product' },
      isProductComponent: true,
      isLoading: false,
    });

    await act(async () => {
      await rerender({});
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '17' },
    });
  });

  it('reads the back target from the loaded record while the form still holds the sentinel', async () => {
    // The query resolves one commit before `useProductFormHydration` resets the
    // form, so there is always a frame where `isLoading` is false and `product`
    // is still the blank `newProduct()` sentinel (role 'product', no parentID).
    // A back press captured in that frame used to replace to '/products'.
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product: { ...baseProduct, id: undefined, role: 'product', parentID: undefined },
      serverProduct: { ...baseProduct, role: 'component', parentID: 17, parentRole: 'product' },
      isProductComponent: false,
      isLoading: false,
    });

    const { result } = await renderHook(() => useProductPageScreen({ role: 'component' }));

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '17' },
    });
  });

  it('does not show the discard dialog twice after confirming a guarded back action', async () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: true,
    });

    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    await act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);

    const firstAlert = mockAlert.mock.calls[0]?.[0] as
      | { buttons?: Array<{ text: string; onPress?: () => void }> }
      | undefined;
    const discardButton = firstAlert?.buttons?.find((button) => button.text === 'Discard');

    expect(discardButton).toBeDefined();

    await act(() => {
      discardButton?.onPress?.();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');

    await act(() => {
      beforeRemoveListener?.({
        preventDefault: jest.fn(),
        data: { action: { type: 'GO_BACK' } },
      });
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it('collapses the FAB when the hook receives a downward scroll event', async () => {
    const { result } = await renderHook(() => useProductPageScreen({ role: 'product' }));

    expect(result.current.editing.fabExtended).toBe(true);

    await act(() => {
      result.current.editing.onScroll({
        nativeEvent: { contentOffset: { y: 120 } },
      } as never);
    });

    expect(result.current.editing.fabExtended).toBe(false);
  });
});
