import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import type { Text as RNText } from 'react-native';
import { useProductForm } from '@/hooks/useProductForm';
import { useProductQuery } from '@/hooks/useProductQueries';
import { ProductNotFoundError } from '@/services/api/products';
import { baseProduct, renderWithProviders } from '@/test-utils';
import ProductPage from '../index';

const mockUseProductForm = jest.mocked(useProductForm);
const mockUseProductQuery = jest.mocked(useProductQuery);
const mockUseAuth = jest.fn();
const mockSetOptions = jest.fn();
const mockReplace = jest.fn();

const baseFormReturn = {
  product: baseProduct,
  editMode: false,
  isNew: false,
  isProductComponent: false,
  justCreated: false,
  validationResult: { isValid: true, error: '' },
  isLoading: false,
  isError: false,
  error: '',
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
  toggleEditMode: jest.fn(),
  onProductDelete: jest.fn(),
};

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useProductForm', () => ({
  useProductForm: jest.fn(),
}));

jest.mock('@/hooks/useProductQueries', () => ({
  useProductQuery: jest.fn(),
}));

jest.mock('@react-navigation/elements', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    HeaderBackButton: ({ onPress }: { onPress?: () => void }) =>
      mockReact.createElement(
        Pressable,
        { onPress, accessibilityLabel: 'header-back' },
        mockReact.createElement(Text, null, 'Back'),
      ),
  };
});

jest.mock('react-native-keyboard-controller', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    KeyboardAwareScrollView: ({
      children,
      ...props
    }: {
      children?: ReactNode;
      [key: string]: unknown;
    }) => mockReact.createElement(ScrollView, { ...props, testID: 'product-scroll' }, children),
  };
});

jest.mock('react-native-paper', () => {
  const actual = jest.requireActual<typeof import('react-native-paper')>('react-native-paper');
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };

  return {
    ...actual,
    AnimatedFAB: ({
      icon,
      label,
      ...props
    }: {
      icon?: string | (() => ReactNode);
      label?: string;
      [key: string]: unknown;
    }) => {
      const iconNode = typeof icon === 'function' ? icon() : icon;
      const iconName = React.isValidElement(iconNode)
        ? ((iconNode.props as { name?: string }).name ??
          (iconNode.type === actual.ActivityIndicator ? 'loading' : 'unknown'))
        : 'unknown';
      return React.createElement(Text, { ...props }, `${label}:${iconName}`);
    },
  };
});

jest.mock(
  '@/components/product/ProductCircularityProperties',
  () => 'ProductCircularityProperties',
);
jest.mock('@/components/product/ProductComponents', () => 'ProductComponents');
jest.mock('@/components/product/ProductDelete', () => 'ProductDelete');
jest.mock('@/components/product/ProductDescription', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };

  function ProductDescriptionMock({ product }: { product: { name?: string } }) {
    return mockReact.createElement(Text, null, `Description:${product.name ?? ''}`);
  }

  return ProductDescriptionMock;
});
jest.mock('@/components/product/ProductImageGallery', () => 'ProductImageGallery');
jest.mock('@/components/product/ProductMetaData', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };

  function ProductMetaDataMock({ product }: { product: { name?: string } }) {
    return mockReact.createElement(Text, null, `Meta:${product.name ?? ''}`);
  }

  return ProductMetaDataMock;
});
jest.mock('@/components/product/ProductPhysicalProperties', () => 'ProductPhysicalProperties');
jest.mock('@/components/product/ProductTags', () => 'ProductTags');
jest.mock('@/components/product/ProductType', () => 'ProductType');
jest.mock('@/components/product/ProductVideo', () => 'ProductVideo');

describe('ProductPage state handling', () => {
  type HeaderOptions = {
    headerRight?: () => ReactNode;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: '1',
        username: 'owner',
        email: 'owner@example.com',
        isActive: true,
        isVerified: true,
        isSuperuser: false,
        oauth_accounts: [],
      },
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '42' });
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockSetOptions,
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
    });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: jest.fn(),
    });
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
    } as never);
    mockUseProductQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  });

  it('shows the saved FAB icon after a successful save', async () => {
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      justSaved: true,
    } as never);

    const { unmount } = renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('Edit Product:check-bold')).toBeOnTheScreen();
    });

    unmount();
  });

  it('renders the error state and retries the load', () => {
    const refetch = jest.fn();
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    expect(screen.getByText('Oops! Something went wrong')).toBeOnTheScreen();
    expect(screen.getByText('Error: boom')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Try Again'));

    expect(refetch).toHaveBeenCalled();
  });

  it('renders the not-found state for missing products', () => {
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      isError: true,
      error: new ProductNotFoundError(42),
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    expect(screen.getByText('Product not found')).toBeOnTheScreen();
    expect(
      screen.getByText('This product may have been removed or the link is no longer valid.'),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Back to products'));

    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('collapses the FAB label on scroll down and restores it on scroll up', async () => {
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product: { ...baseProduct, ownedBy: 'me' },
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('Edit Product:pencil')).toBeOnTheScreen();
    });

    // Fire scroll events to exercise the onScroll handler
    fireEvent.scroll(screen.getByText('Edit Product:pencil'), {
      nativeEvent: { contentOffset: { y: 100 } },
    });

    // Scroll back to top
    fireEvent.scroll(screen.getByText('Edit Product:pencil'), {
      nativeEvent: { contentOffset: { y: 0 } },
    });

    // Component doesn't crash and FAB still renders
    expect(screen.getByText('Edit Product:pencil')).toBeOnTheScreen();
  });

  it('shows slow-loading card after timeout', async () => {
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      isLoading: true,
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    // Initially just the skeleton, no slow-loading message
    expect(screen.queryByText(/taking longer than usual/i)).toBeNull();

    // Advance fake timers past the 5s threshold inside act()
    await act(() => {
      jest.advanceTimersByTime(5100);
    });

    expect(screen.getByText(/taking longer than usual/i)).toBeOnTheScreen();
  });

  it('opens the edit-name dialog from the header and saves the trimmed value', async () => {
    const onProductNameChange = jest.fn();
    const product = { ...baseProduct, name: 'Original Name', ownedBy: 'me' };

    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product,
      editMode: true,
      onProductNameChange,
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalled();
    });

    const setOptionsArg = mockSetOptions.mock.calls.at(-1)?.[0] as HeaderOptions | undefined;
    expect(setOptionsArg?.headerRight).toBeInstanceOf(Function);

    renderWithProviders(setOptionsArg?.headerRight?.() as ReactElement, { withDialog: true });

    fireEvent.press(screen.getByText('Edit name'));

    expect(screen.getByPlaceholderText('Product Name')).toBeOnTheScreen();
    expect(
      screen.getByText('Enter a descriptive name between 2 and 100 characters'),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Original Name')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByDisplayValue('Original Name'), '  Updated Name  ');
    fireEvent.press(screen.getByText('OK'));

    expect(onProductNameChange).toHaveBeenCalledWith('Updated Name');
  });

  it('truncates long header labels, renders the component header, and uses the fallback back action', async () => {
    const longProductName =
      'A very long product name that absolutely needs truncation for the navigation bar';
    const longParentName = 'A parent product name that also needs truncation';

    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product: {
        ...baseProduct,
        id: 99,
        name: longProductName,
        parentID: 17,
      },
      editMode: true,
      isProductComponent: true,
    } as never);
    mockUseProductQuery.mockReturnValue({
      data: { ...baseProduct, id: 17, name: longParentName },
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockSetOptions,
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
    });

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalled();
    });

    const setOptionsArg = mockSetOptions.mock.calls.at(-1)?.[0] as {
      title?: string;
      headerLeft?: () => ReactElement;
      headerTitle?: () => ReactElement;
    };

    expect(setOptionsArg.title).toBeUndefined();
    expect(setOptionsArg.headerTitle).toBeInstanceOf(Function);
    expect(setOptionsArg.headerLeft).toBeInstanceOf(Function);

    renderWithProviders(setOptionsArg.headerTitle?.() as ReactElement, { withDialog: true });

    expect(screen.getByText(/A parent product/)).toBeOnTheScreen();
    expect(screen.getByText(/A very long product name/)).toBeOnTheScreen();

    renderWithProviders(setOptionsArg.headerLeft?.() as ReactElement, {
      withDialog: true,
    });

    fireEvent.press(screen.getByLabelText('header-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '17' },
    });
  });

  it('truncates the navigation title for regular products', async () => {
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      product: {
        ...baseProduct,
        id: 100,
        name: 'A very long product name that absolutely needs truncation for the navigation bar',
      },
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalled();
    });

    const setOptionsArg = mockSetOptions.mock.calls.at(-1)?.[0] as {
      title?: string;
      headerLeft?: () => ReactElement;
    };

    expect(setOptionsArg.title).toMatch(/^A very long product name/);

    renderWithProviders(setOptionsArg.headerLeft?.() as ReactElement, { withDialog: true });
    fireEvent.press(screen.getByLabelText('header-back'));
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('warns before leaving when there are unsaved edits', async () => {
    let beforeRemoveHandler:
      | ((event: { preventDefault: () => void; data: { action: unknown } }) => void)
      | undefined;

    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockSetOptions,
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
      addListener: jest.fn((event: string, handler: typeof beforeRemoveHandler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
      dispatch: jest.fn(),
    });

    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      editMode: true,
    } as never);

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(beforeRemoveHandler).toBeDefined();
    });

    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler?.({
        preventDefault,
        data: { action: { type: 'GO_BACK' } },
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();
  });

  it('collapses the FAB when the product list is scrolled', async () => {
    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('Edit Product:pencil')).toBeOnTheScreen();
    });

    fireEvent.scroll(screen.getByTestId('product-scroll'), {
      nativeEvent: { contentOffset: { y: 120 } },
    });

    expect(screen.getByText('Edit Product:pencil')).toBeOnTheScreen();
  });
});
