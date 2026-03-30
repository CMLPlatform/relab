import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import type { Text as RNText } from 'react-native';
import * as fetching from '@/services/api/fetching';
import { setNewProductIntent } from '@/services/newProductStore';
import { baseProduct, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductComponents from '../ProductComponents';

jest.mock('@/services/api/fetching', () => ({
  productComponents: jest.fn(),
}));

jest.mock('@/services/newProductStore', () => ({
  setNewProductIntent: jest.fn(),
}));

jest.mock('@/components/common/ProductCard', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native') as {
    Text: typeof RNText;
  };
  function ProductCardMock({ product }: { product: { name: string } }) {
    return React.createElement(Text, null, product.name);
  }

  ProductCardMock.displayName = 'ProductCardMock';
  return ProductCardMock;
});

const mockPush = jest.fn();
const mockedProductComponents = jest.mocked(fetching.productComponents);
const mockedSetNewProductIntent = jest.mocked(setNewProductIntent);

describe('ProductComponents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
    mockedProductComponents.mockResolvedValue([]);
  });

  it('renders the Components heading', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await screen.findByText(/Components \(0\)/);
  });

  it("shows 'no subcomponents' message when empty", async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('This product has no subcomponents.')).toBeTruthy();
    });
  });

  it('renders component cards when components are loaded', async () => {
    const componentProduct: Product = { ...baseProduct, id: 2, name: 'Sub Component' };
    mockedProductComponents.mockResolvedValue([componentProduct]);
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('Sub Component')).toBeTruthy();
    });
  });

  it('shows only the first five components by default and can expand the rest', async () => {
    const manyComponents = Array.from({ length: 7 }, (_, index) => ({
      ...baseProduct,
      id: index + 2,
      name: `Component ${index + 1}`,
    }));
    mockedProductComponents.mockResolvedValue(manyComponents);

    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });

    await waitFor(() => {
      expect(screen.getByText('Component 5')).toBeTruthy();
    });
    expect(screen.queryByText('Component 6')).toBeNull();
    expect(screen.getByText('Show 2 more')).toBeTruthy();

    fireEvent.press(screen.getByText('Show 2 more'));
    expect(screen.getByText('Component 6')).toBeTruthy();
    expect(screen.getByText('Component 7')).toBeTruthy();
    expect(screen.getByText('Show less')).toBeTruthy();
  });

  it('shows Add component button when owned by me and not in editMode', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('Add component')).toBeTruthy();
    });
  });

  it('hides Add component button in editMode', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.queryByText('Add component')).toBeNull();
    });
  });

  it('hides Add component button when not owned by me', async () => {
    const notMine = { ...baseProduct, ownedBy: 'other' };
    renderWithProviders(<ProductComponents product={notMine} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.queryByText('Add component')).toBeNull();
    });
  });

  it('opens create component dialog when Add component is pressed', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await screen.findByText('Add component');
    fireEvent.press(screen.getByText('Add component'));
    await waitFor(() => {
      expect(screen.getByText('Create New Component')).toBeTruthy();
    });
  });

  it('creates a new component from the dialog and navigates to the new product route', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(await screen.findByText('Add component'));
    fireEvent.changeText(await screen.findByPlaceholderText('Component Name'), 'Battery pack');
    fireEvent.press(screen.getByText('OK'));

    expect(mockedSetNewProductIntent).toHaveBeenCalledWith({
      name: 'Battery pack',
      isComponent: true,
      parentID: baseProduct.id,
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/products/[id]', params: { id: 'new' } });
  });
});
