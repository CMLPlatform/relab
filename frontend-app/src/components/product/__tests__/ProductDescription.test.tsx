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

  it('should render with initial description', () => {
    const { getByDisplayValue } = render(
      <ProductDescription product={mockProduct} editMode={false} />
    );
    expect(getByDisplayValue('Initial description')).toBeTruthy();
  });

  it('should call onChangeDescription on blur', () => {
    const onChangeDescription = jest.fn();
    const { getByDisplayValue } = render(
      <ProductDescription
        product={mockProduct}
        editMode={true}
        onChangeDescription={onChangeDescription}
      />
    );

    const input = getByDisplayValue('Initial description');
    fireEvent.changeText(input, 'Updated description');
    fireEvent(input, 'blur');

    expect(onChangeDescription).toHaveBeenCalledWith('Updated description');
  });

  it('should be editable when editMode is true', () => {
    const { getByDisplayValue } = render(
      <ProductDescription product={mockProduct} editMode={true} />
    );
    const input = getByDisplayValue('Initial description');
    expect(input.props.editable).toBe(true);
  });

  it('should not be editable when editMode is false', () => {
    const { getByDisplayValue } = render(
      <ProductDescription product={mockProduct} editMode={false} />
    );
    const input = getByDisplayValue('Initial description');
    expect(input.props.editable).toBe(false);
  });

  it('should render with placeholder when no description', () => {
    const productWithoutDesc = { ...mockProduct, description: undefined };
    const { getByPlaceholderText } = render(
      <ProductDescription product={productWithoutDesc} editMode={true} />
    );
    expect(getByPlaceholderText('Add a product description')).toBeTruthy();
  });

  it('should update text when typing', () => {
    const { getByDisplayValue } = render(
      <ProductDescription product={mockProduct} editMode={true} />
    );
    const input = getByDisplayValue('Initial description');
    fireEvent.changeText(input, 'New description');
    expect(getByDisplayValue('New description')).toBeTruthy();
  });
});
