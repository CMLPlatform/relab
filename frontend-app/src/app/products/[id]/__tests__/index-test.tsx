import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import type { ScrollView as RNScrollView, Text as RNText } from 'react-native';
import { getProduct, newProduct } from '@/services/api/products';
import { renderWithProviders } from '@/test-utils/index';
import ProductPage from '../index';

const mockedGetProduct = jest.mocked(getProduct);
const mockedNewProduct = jest.mocked(newProduct);
const mockUseAuth = jest.fn();

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/api/products', () => ({
  getProduct: jest.fn(),
  newProduct: jest.fn(),
}));

jest.mock('@/services/api/saving', () => ({
  deleteProduct: jest.fn(),
  saveProduct: jest.fn(),
}));

jest.mock('@/services/api/validation/productSchema', () => {
  const actual = jest.requireActual<typeof import('@/services/api/validation/productSchema')>(
    '@/services/api/validation/productSchema',
  );

  return {
    ...actual,
    getProductNameHelperText: jest.fn(() => 'help text'),
  };
});

jest.mock('react-native-keyboard-controller', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native') as {
    ScrollView: typeof RNScrollView;
  };

  return {
    KeyboardAwareScrollView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => mockReact.createElement(ScrollView, props, children),
  };
});

function mockCreateSectionStub(label: string) {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };

  return function SectionStub({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) {
    return mockReact.createElement(Text, props, children ?? label);
  };
}

jest.mock('@/components/product/ProductImageGallery', () =>
  mockCreateSectionStub('ProductImageGallery'),
);
jest.mock('@/components/product/ProductCircularityProperties', () =>
  mockCreateSectionStub('ProductCircularityProperties'),
);
jest.mock('@/components/product/ProductComponents', () =>
  mockCreateSectionStub('ProductComponents'),
);
jest.mock('@/components/product/ProductDelete', () => mockCreateSectionStub('ProductDelete'));
jest.mock('@/components/product/ProductPhysicalProperties', () =>
  mockCreateSectionStub('ProductPhysicalProperties'),
);
jest.mock('@/components/product/ProductTags', () => mockCreateSectionStub('ProductTags'));
jest.mock('@/components/product/ProductType', () => mockCreateSectionStub('ProductType'));
jest.mock('@/components/product/ProductVideo', () => mockCreateSectionStub('ProductVideo'));
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

const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockSetOptions = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());

const existingProduct = {
  id: 42,
  name: 'Existing Product',
  description: 'Loaded from API',
  productTypeID: undefined,
  componentIDs: [],
  physicalProperties: { weight: 1, width: 1, height: 1, depth: 1 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'someone-else',
};

const newProductDraft = {
  id: 'new' as const,
  name: 'Draft Product',
  description: '',
  productTypeID: undefined,
  componentIDs: [],
  physicalProperties: { weight: 1, width: 1, height: 1, depth: 1 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

describe('ProductPage route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: mockSetParams,
    });
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockSetOptions,
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
      addListener: mockAddListener,
      dispatch: jest.fn(),
    });
    mockedNewProduct.mockReturnValue(newProductDraft);
    mockedGetProduct.mockResolvedValue(existingProduct);
  });

  it('redirects guests to login and back to /products when deep-linking to /products/new', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'new', name: 'Draft Product' });
    mockUseAuth.mockReturnValue({ user: null });

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/products' },
      });
    });
  });

  it('allows authenticated users to open /products/new', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'new', name: 'Draft Product' });
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

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(newProduct).toHaveBeenCalledWith(undefined, NaN, undefined, undefined);
      expect(screen.getByText('Description:Draft Product')).toBeOnTheScreen();
      expect(screen.getByText('Save Product')).toBeOnTheScreen();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('allows guests to view an existing product route without redirecting', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '42' });
    mockUseAuth.mockReturnValue({ user: null });

    renderWithProviders(<ProductPage />, { withDialog: true });

    await waitFor(() => {
      expect(getProduct).toHaveBeenCalledWith(42);
      expect(screen.getByText('Description:Existing Product')).toBeOnTheScreen();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
