import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import type { Text as RNText } from 'react-native';
import ProductPage from '../index';
import { baseProduct, renderWithProviders } from '@/test-utils';
import { useProductForm } from '@/hooks/useProductForm';

const mockUseProductForm = jest.mocked(useProductForm);
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

jest.mock('react-native-keyboard-controller', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    KeyboardAwareScrollView: ({ children, ...props }: any) => mockReact.createElement(ScrollView, props, children),
  };
});

jest.mock('react-native-paper', () => {
  const actual = jest.requireActual<typeof import('react-native-paper')>('react-native-paper');
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as { Text: typeof RNText };

  return {
    ...actual,
    AnimatedFAB: ({ icon, label, ...props }: any) => {
      const iconNode = typeof icon === 'function' ? icon() : icon;
      const iconName = iconNode?.props?.name ?? (iconNode?.type === actual.ActivityIndicator ? 'loading' : 'unknown');
      return React.createElement(Text, { ...props }, `${label}:${iconName}`);
    },
  };
});

jest.mock('@/components/product/ProductAmountInParent', () => 'ProductAmountInParent');
jest.mock('@/components/product/ProductCircularityProperties', () => 'ProductCircularityProperties');
jest.mock('@/components/product/ProductComponents', () => 'ProductComponents');
jest.mock('@/components/product/ProductDelete', () => 'ProductDelete');
jest.mock('@/components/product/ProductDescription', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as { Text: typeof RNText };

  function ProductDescriptionMock({ product }: { product: { name?: string } }) {
    return mockReact.createElement(Text, null, `Description:${product.name ?? ''}`);
  }

  return ProductDescriptionMock;
});
jest.mock('@/components/product/ProductImageGallery', () => 'ProductImageGallery');
jest.mock('@/components/product/ProductMetaData', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as { Text: typeof RNText };

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
  });

  it('shows the saved FAB icon after a successful save', async () => {
    mockUseProductForm.mockReturnValue({
      ...baseFormReturn,
      justSaved: true,
    } as never);

    const { unmount } = renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(screen.getByText('Edit Product:check-bold')).toBeTruthy();
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

    expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();
    expect(screen.getByText('Error: boom')).toBeTruthy();

    fireEvent.press(screen.getByText('Try Again'));

    expect(refetch).toHaveBeenCalled();
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

    renderWithProviders(<>{setOptionsArg?.headerRight?.()}</>, { withDialog: true });

    fireEvent.press(screen.getByText('Edit name'));

    expect(screen.getByPlaceholderText('Product Name')).toBeTruthy();
    expect(screen.getByText('Enter a descriptive name between 2 and 100 characters')).toBeTruthy();
    expect(screen.getByDisplayValue('Original Name')).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('Original Name'), '  Updated Name  ');
    fireEvent.press(screen.getByText('OK'));

    expect(onProductNameChange).toHaveBeenCalledWith('Updated Name');
  });
});
