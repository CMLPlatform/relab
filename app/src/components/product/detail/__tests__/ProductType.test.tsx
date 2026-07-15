import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import ProductType from '@/components/product/detail/ProductType';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { loadCPV } from '@/services/cpv';
import { baseProduct as _base, renderWithProviders, setupUser } from '@/test-utils/index';
import type { Product } from '@/types/Product';

jest.mock('@/services/cpv');
jest.mock('@/features/products/pendingTypeSelection', () => ({
  takePendingTypeSelection: jest.fn(),
  setPendingTypeSelection: jest.fn(),
}));

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockedLoadCPV = jest.mocked(loadCPV);
const mockedTakePending = jest.mocked(takePendingTypeSelection);
const TYPE_OR_MATERIAL_PATTERN = /Type or Material/;

const baseProduct: Product = { ..._base, productTypeID: undefined };

describe('ProductType', () => {
  const user = setupUser();

  beforeEach(() => {
    mockPush.mockReset();
    mockSetParams.mockReset();
    mockedLoadCPV.mockResolvedValue({
      // Mirror the real cpv.json root placeholder — CPVCard renders a category
      // whose name === 'undefined' as a red "Category undefined" error card.
      root: {
        id: 0,
        name: 'undefined',
        description: 'Category undefined',
        allChildren: [],
        directChildren: [],
        updatedAt: '',
        createdAt: '',
      },
      '1': {
        id: 1,
        name: '03000000-1',
        description: 'Agricultural products',
        allChildren: [],
        directChildren: [],
        updatedAt: '',
        createdAt: '',
      },
    });
    mockedTakePending.mockReturnValue(null);
    (useFocusEffect as jest.Mock).mockReset();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: mockSetParams,
    });
  });

  it("renders 'Type or Material' heading", async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={true} />);
    expect(await screen.findByText(TYPE_OR_MATERIAL_PATTERN)).toBeOnTheScreen();
  });

  it('uses component tooltip wording for components', async () => {
    const component = { ...baseProduct, role: 'component' as const, parentID: 1 };
    renderWithProviders(<ProductType product={component} editMode={true} />);
    expect(await screen.findByText(TYPE_OR_MATERIAL_PATTERN)).toBeOnTheScreen();
    expect(screen.queryByText('Select a fitting category for the product.')).toBeNull();
  });

  // Regression: the root CPV entry is a placeholder ({name: "undefined"})
  // that CPVCard renders as a red error card — a typeless product must never
  // show that as its default first impression.
  it('shows an inviting empty state instead of the undefined category card when no type is picked', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={true} />);
    expect(await screen.findByText('Choose a type or material')).toBeOnTheScreen();
    expect(screen.queryByText('Category undefined')).toBeNull();
  });

  it('renders nothing for a typeless product in view mode', async () => {
    const { queryByText } = renderWithProviders(
      <ProductType product={baseProduct} editMode={false} />,
    );
    // Flush the loadCPV() effect (its result is unused for a typeless
    // product in view mode, but the effect still runs) before asserting.
    await act(async () => {});
    expect(queryByText(TYPE_OR_MATERIAL_PATTERN)).toBeNull();
    expect(queryByText('Choose a type or material')).toBeNull();
    expect(queryByText('Category undefined')).toBeNull();
  });

  it('renders the correct category description when productTypeID is set', async () => {
    const product = { ...baseProduct, productTypeID: 1 };
    renderWithProviders(<ProductType product={product} editMode={false} />);
    expect(await screen.findByText('Agricultural products')).toBeOnTheScreen();
  });

  // Regression: an unresolvable (stale/unknown) type id used to fall back to
  // cpv.root, which CPVCard renders as a red "Category undefined" error card.
  it('renders nothing for an unresolvable type id instead of the undefined error card', async () => {
    const product = { ...baseProduct, productTypeID: 999 };
    renderWithProviders(<ProductType product={product} editMode={false} />);
    await act(async () => {});
    expect(screen.queryByText('Category undefined')).toBeNull();
  });

  it('applies a pending type selection when the screen regains focus', async () => {
    const onTypeChange = jest.fn();
    // The unit-lane mock is a no-op; make useFocusEffect run its callback so the
    // pending-slot consume path is exercised.
    (useFocusEffect as jest.Mock).mockImplementation((cb: unknown) => (cb as () => void)());
    mockedTakePending.mockReturnValue(123);

    renderWithProviders(
      <ProductType product={baseProduct} editMode={false} onTypeChange={onTypeChange} />,
    );

    await waitFor(() => {
      expect(onTypeChange).toHaveBeenCalledWith(123);
    });
  });

  it('navigates to category selection on press in editMode', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={true} />);
    await user.press(await screen.findByText('Choose a type or material'));
    expect(mockPush).toHaveBeenCalledWith('/category-selection');
  });

  // Regression: a guard used to block the picker for unsaved drafts (no numeric
  // id), so a new product could never set its type before the first save.
  it('opens the picker for an unsaved draft (no id) in editMode', async () => {
    const draft = { ...baseProduct, id: undefined } as unknown as Product;
    renderWithProviders(<ProductType product={draft} editMode={true} />);
    await user.press(await screen.findByText('Choose a type or material'));
    expect(mockPush).toHaveBeenCalledWith('/category-selection');
  });

  it('does not navigate when not in editMode', async () => {
    const product = { ...baseProduct, productTypeID: 1 };
    renderWithProviders(<ProductType product={product} editMode={false} />);
    await user.press(await screen.findByText('Agricultural products'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
