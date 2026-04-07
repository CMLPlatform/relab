import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { baseProduct as _base } from '@/test-utils/fixtures';
import type { Product } from '@/types/Product';
import ProductDescription from '../ProductDescription';

const baseProduct: Product = { ..._base, description: 'Initial description' };

describe('ProductDescription', () => {
  it('renders the product description as input value', () => {
    render(<ProductDescription product={baseProduct} editMode={true} />);
    expect(screen.getByDisplayValue('Initial description')).toBeOnTheScreen();
  });

  it('renders placeholder when description is empty', () => {
    const product = { ...baseProduct, description: undefined };
    render(<ProductDescription product={product} editMode={true} />);
    expect(screen.getByPlaceholderText('Add a product description')).toBeOnTheScreen();
  });

  it('calls onChangeDescription on blur', () => {
    const onChangeDescription = jest.fn();
    render(
      <ProductDescription
        product={baseProduct}
        editMode={true}
        onChangeDescription={onChangeDescription}
      />,
    );
    const input = screen.getByDisplayValue('Initial description');
    fireEvent.changeText(input, 'New description');
    fireEvent(input, 'blur');
    expect(onChangeDescription).toHaveBeenCalledWith('New description');
  });

  it('is not editable when editMode is false', () => {
    render(<ProductDescription product={baseProduct} editMode={false} />);
    expect(screen.getByText('Initial description')).toBeOnTheScreen();
  });

  it('shows a collapsed description with a toggle for long text in view mode', () => {
    const product = { ...baseProduct, description: 'Long description. '.repeat(30) };
    render(<ProductDescription product={product} editMode={false} />);

    expect(screen.getByText('Show more')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Show more'));
    expect(screen.getByText('Show less')).toBeOnTheScreen();
  });

  it('shows a toggle for multi-line descriptions even when they are short', () => {
    const product = {
      ...baseProduct,
      description: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7'].join(
        '\n',
      ),
    };
    render(<ProductDescription product={product} editMode={false} />);

    expect(screen.getByText('Show more')).toBeOnTheScreen();
  });

  it('shows an empty-state message when no description is available in view mode', () => {
    const product = { ...baseProduct, description: undefined };
    render(<ProductDescription product={product} editMode={false} />);

    expect(screen.getByText('No description yet.')).toBeOnTheScreen();
  });
});
