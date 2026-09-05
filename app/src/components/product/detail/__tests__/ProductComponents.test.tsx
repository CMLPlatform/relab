import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import ProductComponents from '@/components/product/detail/ProductComponents';
import { saveProduct } from '@/services/api/saving';
import { baseProduct, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';

jest.mock('@/services/api/saving', () => ({
  ...(jest.requireActual('@/services/api/saving') as object),
  saveProduct: jest.fn(async () => 42),
}));

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

  // The "Components (n)" heading is now rendered by the wrapping Section
  // (title + titleSuffix, see content-sections.test.ts) — this component no
  // longer owns a heading of its own.
  it("shows 'no subcomponents' message when empty", async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('This product has no subcomponents.')).toBeOnTheScreen();
    });
  });

  it('renders component rows when components are loaded', async () => {
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
    const collapsed = screen.getByRole('button', { name: 'Show 2 more components' });
    expect(collapsed.props.accessibilityState).toMatchObject({ expanded: false });

    fireEvent.press(collapsed);
    expect(screen.getByText('Component 6')).toBeOnTheScreen();
    expect(screen.getByText('Component 7')).toBeOnTheScreen();
    const expandedToggle = screen.getByRole('button', { name: 'Show fewer components' });
    expect(expandedToggle.props.accessibilityState).toMatchObject({ expanded: true });

    // Collapsing again must actually hide the extra rows — an assertion that
    // fails if the toggle stops toggling.
    fireEvent.press(expandedToggle);
    expect(screen.queryByText('Component 6')).toBeNull();
  });

  it('shows Add component button when owned by me and not in editMode', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('Add component')).toBeOnTheScreen();
    });
  });

  // Was 'hides Add component button in editMode'. That asserted the defect:
  // creation routes to `?edit=1`, so hiding the button removed the teardown's
  // next step exactly when the user has the opened product in front of them.
  // The record is already persisted on that route, so the gate is `id`.
  it('shows Add component in editMode once the record has an id', async () => {
    renderWithProviders(<ProductComponents product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    await waitFor(() => {
      expect(screen.getByText('Add component')).toBeOnTheScreen();
    });
  });

  it('hides Add component while the record has no id yet', async () => {
    const unsaved = { ...baseProduct, id: undefined };
    renderWithProviders(<ProductComponents product={unsaved} editMode={true} />, {
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

    // The push is deferred one frame so it cannot race the
    // `setParams({ edit: undefined })` that leaving edit mode dispatches — see
    // ProductComponents.newComponent. waitFor is therefore part of the contract,
    // not test flakiness padding.
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/products/[id]/components/new',
        params: { id: String(baseProduct.id) },
      }),
    );
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

    // The push is deferred one frame so it cannot race the
    // `setParams({ edit: undefined })` that leaving edit mode dispatches — see
    // ProductComponents.newComponent. waitFor is therefore part of the contract,
    // not test flakiness padding.
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/components/[id]/components/new',
        params: { id: '9' },
      }),
    );
  });

  it('duplicates a component row in edit mode, copying the spec fields only', async () => {
    const componentProduct: Product = {
      ...baseProduct,
      id: 7,
      role: 'component',
      parentID: baseProduct.id,
      name: 'Aluminium bracket',
      brand: 'Acme',
      model: 'B-12',
      description: 'Holds the frame',
      productTypeID: 3,
      amountInParent: 2,
      images: [{ id: 'img-1', url: 'https://example.test/a.jpg', description: '' }],
      videos: [{ id: 1, url: 'https://example.test/a.mp4', description: '', title: 'v' }],
      components: [{ ...baseProduct, id: 8, role: 'component', name: 'Screw' }],
    };

    renderWithProviders(
      <ProductComponents
        product={{ ...baseProduct, components: [componentProduct] }}
        editMode={true}
      />,
      { withDialog: true },
    );

    fireEvent.press(await screen.findByLabelText('Duplicate Aluminium bracket'));

    await waitFor(() => expect(saveProduct).toHaveBeenCalled());
    const copy = (saveProduct as jest.Mock).mock.calls[0]?.[0] as Product;
    expect(copy).toMatchObject({
      id: undefined,
      role: 'component',
      parentID: baseProduct.id,
      parentRole: 'product',
      name: 'Aluminium bracket',
      brand: 'Acme',
      model: 'B-12',
      description: 'Holds the frame',
      productTypeID: 3,
      amountInParent: 2,
      physicalProperties: componentProduct.physicalProperties,
      circularityProperties: componentProduct.circularityProperties,
    });
    expect(copy.images).toEqual([]);
    expect(copy.videos).toEqual([]);
    expect(copy.components).toEqual([]);
    expect(copy.componentIDs).toEqual([]);
  });

  it('offers no duplicate action outside edit mode', async () => {
    const componentProduct: Product = {
      ...baseProduct,
      id: 7,
      role: 'component',
      parentID: baseProduct.id,
      name: 'Aluminium bracket',
    };
    renderWithProviders(
      <ProductComponents
        product={{ ...baseProduct, components: [componentProduct] }}
        editMode={false}
      />,
      { withDialog: true },
    );

    await screen.findByText('Aluminium bracket');
    expect(screen.queryByLabelText('Duplicate Aluminium bracket')).toBeNull();
  });
});
