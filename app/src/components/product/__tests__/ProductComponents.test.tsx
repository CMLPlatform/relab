import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import type { Text as RNText } from 'react-native';
import { baseProduct, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';
import ProductComponents from '../ProductComponents';

const COMPONENTS_EMPTY_PATTERN = /Components \(0\)/;

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

describe('ProductComponents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders the Components heading', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await screen.findByText(COMPONENTS_EMPTY_PATTERN);
  });

  it("shows 'no subcomponents' message when empty", async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('This product has no subcomponents.')).toBeOnTheScreen();
    });
  });

  it('renders component cards when components are loaded', async () => {
    const componentProduct: Product = {
      ...baseProduct,
      id: 2,
      role: 'component',
      parentID: baseProduct.id,
      name: 'Sub Component',
    };
    renderWithProviders(
      <ProductComponents
        product={{ ...baseProduct, components: [componentProduct] }}
        editMode={false}
      />,
      {
        withDialog: true,
      },
    );
    await waitFor(() => {
      expect(screen.getByText('Sub Component')).toBeOnTheScreen();
    });
  });

  it('shows only the first five components by default and can expand the rest', async () => {
    const manyComponents = Array.from({ length: 7 }, (_, index) => ({
      ...baseProduct,
      id: index + 2,
      role: 'component' as const,
      parentID: baseProduct.id,
      name: `Component ${index + 1}`,
    }));

    renderWithProviders(
      <ProductComponents
        product={{ ...baseProduct, components: manyComponents }}
        editMode={false}
      />,
      {
        withDialog: true,
      },
    );

    await waitFor(() => {
      expect(screen.getByText('Component 5')).toBeOnTheScreen();
    });
    expect(screen.queryByText('Component 6')).toBeNull();
    expect(screen.getByText('Show 2 more')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Show 2 more'));
    expect(screen.getByText('Component 6')).toBeOnTheScreen();
    expect(screen.getByText('Component 7')).toBeOnTheScreen();
    expect(screen.getByText('Show less')).toBeOnTheScreen();
  });

  it('shows Add component button when owned by me and not in editMode', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('Add component')).toBeOnTheScreen();
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

  it('navigates to the base-product scoped create route when Add component is pressed on a product', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(await screen.findByText('Add component'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]/components/new',
      params: { id: String(baseProduct.id) },
    });
  });

  it('navigates to the component-scoped create route when Add component is pressed on a component', async () => {
    const componentProduct: Product = {
      ...baseProduct,
      id: 9,
      role: 'component',
      parentID: baseProduct.id,
      name: 'Existing component',
    };
    renderWithProviders(<ProductComponents product={componentProduct} editMode={false} />, {
      withDialog: true,
    });

    fireEvent.press(await screen.findByText('Add component'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/components/[id]/components/new',
      params: { id: '9' },
    });
  });
});
