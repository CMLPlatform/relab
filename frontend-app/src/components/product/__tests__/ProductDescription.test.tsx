import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProductDescription from '../ProductDescription';
import { Product } from '@/types/Product';

describe('ProductDescription Component', () => {
  const mockProduct: Product = {
    id: 1,
    name: 'Test Product',
    description: 'Initial description',
    componentIDs: [],
    physicalProperties: {
      weight: 100,
      width: 10,
      height: 10,
      depth: 10,
    },
    images: [],
    ownedBy: 'me',
  };

  it('should render and update description', () => {
    const onChangeDescription = jest.fn();
    const { getByDisplayValue } = render(
      <ProductDescription product={mockProduct} editMode={true} onChangeDescription={onChangeDescription} />
    );

    const input = getByDisplayValue('Initial description');
    fireEvent.changeText(input, 'Updated description');
    fireEvent(input, 'blur');

    expect(onChangeDescription).toHaveBeenCalledWith('Updated description');
  });

  it('should respect editMode prop', () => {
    const { getByDisplayValue } = render(<ProductDescription product={mockProduct} editMode={false} />);
    const input = getByDisplayValue('Initial description');
    expect(input.props.editable).toBe(false);
  });

  it('should show placeholder when no description', () => {
    const productWithoutDesc = { ...mockProduct, description: undefined };
    const { getByPlaceholderText } = render(
      <ProductDescription product={productWithoutDesc} editMode={true} />
    );
    expect(getByPlaceholderText('Add a product description')).toBeTruthy();
  });
});
