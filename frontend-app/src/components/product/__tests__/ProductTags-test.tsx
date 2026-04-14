import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { baseProduct as _base, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductTags from '../ProductTags';

jest.mock('@/hooks/useProductQueries', () => ({
  useSearchBrandsQuery: jest.fn(() => ({
    data: ['Apple', 'Samsung', 'Sony'],
    isLoading: false,
  })),
}));

const baseProduct: Product = { ..._base, brand: 'CircularTech', model: 'X100' };

describe('ProductTags', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders brand and model chip values', () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getByText(/CircularTech/)).toBeOnTheScreen();
    expect(screen.getByText(/X100/)).toBeOnTheScreen();
  });

  it("renders 'Unknown' when brand is missing", () => {
    const product = { ...baseProduct, brand: undefined };
    renderWithProviders(<ProductTags product={product} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it("renders 'Unknown' when model is missing", () => {
    const product = { ...baseProduct, model: undefined };
    renderWithProviders(<ProductTags product={product} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('opens brand selection modal on brand chip press in editMode', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText(/CircularTech/));
    expect(screen.getByText('Select Brand')).toBeOnTheScreen();
  });

  it('does not open brand modal when not in editMode', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={false} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText(/CircularTech/));
    expect(screen.queryByText('Select Brand')).toBeNull();
  });

  it('calls onBrandChange when a brand chip is pressed in the modal', async () => {
    const onBrandChange = jest.fn();
    renderWithProviders(
      <ProductTags product={baseProduct} editMode={true} onBrandChange={onBrandChange} />,
      {
        withDialog: true,
      },
    );
    fireEvent.press(screen.getByText(/CircularTech/));
    await screen.findByText('Select Brand');
    fireEvent.press(screen.getByText('Samsung'));
    expect(onBrandChange).toHaveBeenCalledWith('Samsung');
  });

  it('shows a "+ new brand" chip when search text is not in the list', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText(/CircularTech/));
    await screen.findByText('Select Brand');
    fireEvent.changeText(screen.getByPlaceholderText('Search or type a brand…'), 'MyNewBrand');
    await screen.findByText('MyNewBrand');
  });

  it('calls onBrandChange with custom typed brand when new-brand chip is pressed', async () => {
    const onBrandChange = jest.fn();
    renderWithProviders(
      <ProductTags product={baseProduct} editMode={true} onBrandChange={onBrandChange} />,
      {
        withDialog: true,
      },
    );
    fireEvent.press(screen.getByText(/CircularTech/));
    await screen.findByText('Select Brand');
    fireEvent.changeText(screen.getByPlaceholderText('Search or type a brand…'), 'MyNewBrand');
    await screen.findByText('MyNewBrand');
    fireEvent.press(screen.getByText('MyNewBrand'));
    expect(onBrandChange).toHaveBeenCalledWith('MyNewBrand');
  });

  it('opens model input dialog on model chip press in editMode', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText(/X100/));
    expect(screen.getByText('Set Model')).toBeOnTheScreen();
  });

  it('calls onModelChange with the new name when OK is pressed in the model dialog', async () => {
    const onModelChange = jest.fn();
    renderWithProviders(
      <ProductTags product={baseProduct} editMode={true} onModelChange={onModelChange} />,
      {
        withDialog: true,
      },
    );
    fireEvent.press(screen.getByText(/X100/));
    fireEvent.changeText(screen.getByPlaceholderText('Model Name'), 'NewModel');
    fireEvent.press(screen.getByText('OK'));
    expect(onModelChange).toHaveBeenCalledWith('NewModel');
  });

  it('renders without error chips when product is a component (isComponent=true)', () => {
    const componentProduct = {
      ...baseProduct,
      brand: undefined,
      model: undefined,
    };
    renderWithProviders(
      <ProductTags product={componentProduct} editMode={true} isComponent={true} />,
      {
        withDialog: true,
      },
    );
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('AmountChip (isComponent=true)', () => {
  const componentProduct: Product = { ...baseProduct, amountInParent: 3 };

  it('shows the amount value in view mode', () => {
    renderWithProviders(
      <ProductTags product={componentProduct} editMode={false} isComponent={true} />,
      {
        withDialog: true,
      },
    );
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('does not render when isComponent is false', () => {
    renderWithProviders(
      <ProductTags product={componentProduct} editMode={false} isComponent={false} />,
      {
        withDialog: true,
      },
    );
    expect(screen.queryByText('Amount')).toBeNull();
  });

  it('defaults to 1 when amountInParent is undefined', () => {
    const product = { ...baseProduct, amountInParent: undefined };
    renderWithProviders(<ProductTags product={product} editMode={false} isComponent={true} />, {
      withDialog: true,
    });
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('shows a text input with the current amount in edit mode', () => {
    renderWithProviders(
      <ProductTags product={componentProduct} editMode={true} isComponent={true} />,
      {
        withDialog: true,
      },
    );
    expect(screen.getByDisplayValue('3')).toBeOnTheScreen();
  });

  it('calls onAmountChange instantly when text changes', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductTags
        product={componentProduct}
        editMode={true}
        isComponent={true}
        onAmountChange={onAmountChange}
      />,
      { withDialog: true },
    );
    fireEvent.changeText(screen.getByDisplayValue('3'), '7');
    expect(onAmountChange).toHaveBeenCalledWith(7);
  });

  it('strips non-numeric characters from text input', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductTags
        product={componentProduct}
        editMode={true}
        isComponent={true}
        onAmountChange={onAmountChange}
      />,
      { withDialog: true },
    );
    fireEvent.changeText(screen.getByDisplayValue('3'), '5abc');
    expect(onAmountChange).toHaveBeenCalledWith(5);
  });

  it('clamps value to 10000 on text input', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductTags
        product={componentProduct}
        editMode={true}
        isComponent={true}
        onAmountChange={onAmountChange}
      />,
      { withDialog: true },
    );
    fireEvent.changeText(screen.getByDisplayValue('3'), '99999');
    expect(onAmountChange).toHaveBeenCalledWith(10000);
  });

  it('resets to 1 on blur when input is empty', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductTags
        product={componentProduct}
        editMode={true}
        isComponent={true}
        onAmountChange={onAmountChange}
      />,
      { withDialog: true },
    );
    const input = screen.getByDisplayValue('3');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(onAmountChange).toHaveBeenCalledWith(1);
  });

  it('calls onAmountChange with amount + 1 when increment is pressed', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductTags
        product={componentProduct}
        editMode={true}
        isComponent={true}
        onAmountChange={onAmountChange}
      />,
      { withDialog: true },
    );
    fireEvent.press(screen.getByLabelText('Increase amount'));
    expect(onAmountChange).toHaveBeenCalledWith(4);
  });

  it('calls onAmountChange with amount - 1 when decrement is pressed', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductTags
        product={componentProduct}
        editMode={true}
        isComponent={true}
        onAmountChange={onAmountChange}
      />,
      { withDialog: true },
    );
    fireEvent.press(screen.getByLabelText('Decrease amount'));
    expect(onAmountChange).toHaveBeenCalledWith(2);
  });

  it('decrement button is disabled when amount is 1', () => {
    const product = { ...baseProduct, amountInParent: 1 };
    renderWithProviders(<ProductTags product={product} editMode={true} isComponent={true} />, {
      withDialog: true,
    });
    expect(screen.getByLabelText('Decrease amount')).toBeDisabled();
  });

  it('increment button is disabled when amount is 10000', () => {
    const product = { ...baseProduct, amountInParent: 10000 };
    renderWithProviders(<ProductTags product={product} editMode={true} isComponent={true} />, {
      withDialog: true,
    });
    expect(screen.getByLabelText('Increase amount')).toBeDisabled();
  });
});
