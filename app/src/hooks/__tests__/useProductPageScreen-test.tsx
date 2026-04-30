import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useProductPageScreen } from '@/hooks/products/useProductPageScreen';

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

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
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

jest.mock('@/hooks/useRpiIntegration', () => ({
  useRpiIntegration: () => ({ enabled: true }),
}));

jest.mock('@/hooks/useYouTubeIntegration', () => ({
  useYouTubeIntegration: () => ({ enabled: true }),
}));

jest.mock('@/hooks/useProductForm', () => ({
  useProductForm: (...args: unknown[]) => mockUseProductForm(...args),
}));

jest.mock('@/hooks/useProductQueries', () => ({
  useBaseProductQuery: (...args: unknown[]) => mockUseProductQuery(...args),
  useComponentQuery: (...args: unknown[]) => mockUseProductQuery(...args),
}));

jest.mock('@/hooks/products/useAncestorTrail', () => ({
  useAncestorTrail: (...args: unknown[]) => mockUseAncestorTrail(...args),
}));

jest.mock('react-native-paper', () => {
  const actual = jest.requireActual<typeof import('react-native-paper')>('react-native-paper');
  return {
    ...actual,
    useTheme: () => ({
      colors: {
        onBackground: '#000',
        onSurfaceVariant: '#999',
      },
    }),
  };
});

const baseProduct = {
  id: 42,
  name: 'Desk Radio',
  parentID: undefined,
  ownedBy: 'me',
};

const baseFormReturn = {
  product: baseProduct,
  editMode: false,
  isDirty: false,
  isNew: false,
  isProductComponent: false,
  validationResult: { isValid: true, error: '' },
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  isSaving: false,
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

  it('returns grouped screen, editing, streaming, capabilities, and actions domains', () => {
    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    expect(result.current.screen.product).toEqual(baseProduct);
    expect(result.current.editing.editMode).toBe(false);
    expect(result.current.streaming.streamingOtherProduct).toBe(true);
    expect(result.current.capabilities.ownedByMe).toBe(true);
    expect(typeof result.current.actions.saveAndExit).toBe('function');
  });

  it('opens and closes the stream picker through named actions', () => {
    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    expect(result.current.streaming.streamPickerVisible).toBe(false);

    act(() => {
      result.current.streaming.openStreamPicker();
    });
    expect(result.current.streaming.streamPickerVisible).toBe(true);

    act(() => {
      result.current.streaming.closeStreamPicker();
    });
    expect(result.current.streaming.streamPickerVisible).toBe(false);
  });

  it('navigates back immediately when not editing', () => {
    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('prompts before navigating back when editing', () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: true,
    });

    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Discard changes?',
      }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates back without a discard prompt when editing with no unsaved changes', () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: false,
    });

    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('uses the component parent role when navigating back before ancestor crumbs load', () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      product: {
        ...baseProduct,
        role: 'component',
        parentID: 17,
        parentRole: 'component',
      },
      isProductComponent: true,
    });
    mockUseAncestorTrail.mockReturnValueOnce({ ancestors: [], isLoading: true });

    const { result } = renderHook(() => useProductPageScreen({ role: 'component' }));

    act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/components/[id]',
      params: { id: '17' },
    });
  });

  it('prompts before navigating back from a new (unsaved) product even with no edits', () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: false,
      isNew: true,
    });

    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Discard changes?' }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not show the discard dialog twice after confirming a guarded back action', () => {
    mockUseProductForm.mockReturnValueOnce({
      ...baseFormReturn,
      editMode: true,
      isDirty: true,
    });

    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    act(() => {
      result.current.actions.goBackWithGuards();
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);

    const firstAlert = mockAlert.mock.calls[0]?.[0] as
      | { buttons?: Array<{ text: string; onPress?: () => void }> }
      | undefined;
    const discardButton = firstAlert?.buttons?.find((button) => button.text === 'Discard');

    expect(discardButton).toBeDefined();

    act(() => {
      discardButton?.onPress?.();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');

    act(() => {
      beforeRemoveListener?.({
        preventDefault: jest.fn(),
        data: { action: { type: 'GO_BACK' } },
      });
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it('navigates to the active stream product and profile setup routes', () => {
    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    act(() => {
      result.current.actions.goToActiveStreamProduct();
      result.current.actions.goToProfileForYouTubeSetup();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '99' },
    });
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('collapses the FAB when the hook receives a downward scroll event', () => {
    const { result } = renderHook(() => useProductPageScreen({ role: 'product' }));

    expect(result.current.editing.fabExtended).toBe(true);

    act(() => {
      result.current.editing.onScroll({
        nativeEvent: { contentOffset: { y: 120 } },
      } as never);
    });

    expect(result.current.editing.fabExtended).toBe(false);
  });
});
