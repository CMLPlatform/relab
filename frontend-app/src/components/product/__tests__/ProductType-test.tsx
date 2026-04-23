import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { loadCPV } from '@/services/cpv';
import { baseProduct as _base, renderWithProviders, setupUser } from '@/test-utils/index';
import type { Product } from '@/types/Product';
import ProductType from '../ProductType';

jest.mock('@/services/cpv');

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockedLoadCPV = jest.mocked(loadCPV);
const TYPE_OR_MATERIAL_PATTERN = /Type or Material/;

const baseProduct: Product = { ..._base, productTypeID: undefined };

describe('ProductType', () => {
  const user = setupUser();

  beforeEach(() => {
    mockPush.mockReset();
    mockSetParams.mockReset();
    mockedLoadCPV.mockResolvedValue({
      root: {
        id: 0,
        name: 'root',
        description: 'All categories',
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
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: mockSetParams,
    });
  });

  it("renders 'Type or Material' heading", async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={false} />);
    expect(await screen.findByText(TYPE_OR_MATERIAL_PATTERN)).toBeOnTheScreen();
  });

  it('renders the root category when productTypeID is undefined', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={false} />);
    expect(await screen.findByText('All categories')).toBeOnTheScreen();
  });

  it('renders the correct category description when productTypeID is set', async () => {
    const product = { ...baseProduct, productTypeID: 1 };
    renderWithProviders(<ProductType product={product} editMode={false} />);
    expect(await screen.findByText('Agricultural products')).toBeOnTheScreen();
  });

  it('falls back to the root category when the selected type is missing', async () => {
    const product = { ...baseProduct, productTypeID: 999 };
    renderWithProviders(<ProductType product={product} editMode={false} />);
    expect(await screen.findByText('All categories')).toBeOnTheScreen();
  });

  it('applies a type selection from route params and clears the param', async () => {
    const onTypeChange = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ typeSelection: '123' });

    renderWithProviders(
      <ProductType product={baseProduct} editMode={false} onTypeChange={onTypeChange} />,
    );

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({ typeSelection: undefined });
      expect(onTypeChange).toHaveBeenCalledWith(123);
    });
  });

  it('navigates to category selection on press in editMode', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={true} />);
    await user.press(await screen.findByText('All categories'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/products/[id]/category_selection',
      }),
    );
  });

  it('does not navigate when not in editMode', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={false} />);
    await user.press(await screen.findByText('All categories'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
