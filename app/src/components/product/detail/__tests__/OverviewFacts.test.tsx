import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { OverviewFacts } from '@/components/product/detail/OverviewFacts';
import { loadCPV } from '@/services/cpv';
import { baseProduct as _base, renderWithProviders, setupUser } from '@/test-utils/index';
import type { Product } from '@/types/Product';

jest.mock('@/services/cpv');

const mockPush = jest.fn();
const mockedLoadCPV = jest.mocked(loadCPV);
const VIEW_ALL_LABEL_PATTERN = /View all products of type/;

const baseProduct: Product = {
  ..._base,
  brand: 'CircularTech',
  model: 'X100',
  productTypeID: undefined,
};

describe('OverviewFacts', () => {
  const user = setupUser();

  beforeEach(() => {
    mockPush.mockReset();
    mockedLoadCPV.mockResolvedValue({
      '1': {
        id: 1,
        name: '03000000-1',
        description: 'Agricultural products',
        allChildren: [],
        directChildren: [],
        updatedAt: '',
        createdAt: '',
      },
    } as never);
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: jest.fn() });
  });

  it('states brand and model as spec facts, one stop each, with no buttons', async () => {
    await renderWithProviders(<OverviewFacts product={baseProduct} />);
    expect(screen.getByLabelText('Brand: CircularTech')).toBeOnTheScreen();
    expect(screen.getByLabelText('Model: X100')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a missing brand or model as a neutral dash', async () => {
    await renderWithProviders(
      <OverviewFacts product={{ ...baseProduct, brand: undefined, model: undefined }} />,
    );
    expect(screen.getByLabelText('Brand: —')).toBeOnTheScreen();
    expect(screen.getByLabelText('Model: —')).toBeOnTheScreen();
  });

  it('adds the amount for a component, defaulting to 1', async () => {
    const component = { ...baseProduct, role: 'component' as const, parentID: 1 };
    await renderWithProviders(<OverviewFacts product={component} />);
    expect(screen.getByLabelText('Amount: 1')).toBeOnTheScreen();
  });

  // One row: the type joins brand and model, its description and link sit under it.
  it('puts the type in the same row, with its description and a list link under it', async () => {
    const product = { ...baseProduct, productTypeID: 1, productTypeName: '03000000-1' };
    await renderWithProviders(<OverviewFacts product={product} />);
    expect(await screen.findByLabelText('Product type: 03000000-1')).toBeOnTheScreen();
    expect(screen.getByText('Agricultural products')).toBeOnTheScreen();
    await user.press(screen.getByLabelText('View all products of type 03000000-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products',
      params: { types: '03000000-1' },
    });
  });

  it('holds the type slot with placeholders while it resolves, so nothing pops in', async () => {
    mockedLoadCPV.mockReturnValue(new Promise(() => {}));
    const product = { ...baseProduct, productTypeID: 1 };
    await renderWithProviders(<OverviewFacts product={product} />);
    expect(screen.getByText('Product type')).toBeOnTheScreen();
    expect(screen.getByTestId('spec-fact-skeleton')).toBeOnTheScreen();
    expect(screen.getByTestId('type-description-skeleton')).toBeOnTheScreen();
  });

  // The bundled snapshot is keyed by its own ids; the recorded type wins.
  it('shows the type the API recorded, not the snapshot entry sharing its id', async () => {
    const product = {
      ...baseProduct,
      productTypeID: 1,
      productType: { id: 1, name: 'Display module', description: 'A screen assembly.' },
    };
    await renderWithProviders(<OverviewFacts product={product} />);
    expect(screen.getByLabelText('Product type: Display module')).toBeOnTheScreen();
    expect(screen.queryByText('Agricultural products')).toBeNull();
  });

  it('omits the type and its link for a typeless product', async () => {
    await renderWithProviders(<OverviewFacts product={baseProduct} />);
    await act(async () => {});
    expect(screen.queryByText('Product type')).toBeNull();
    expect(screen.queryByLabelText(VIEW_ALL_LABEL_PATTERN)).toBeNull();
  });
});
