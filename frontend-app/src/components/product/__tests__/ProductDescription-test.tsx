import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ProductDescription from '../ProductDescription';
import type { Product } from '@/types/Product';

const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  description: 'Initial description',
  componentIDs: [],
  physicalProperties: { weight: 100, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

describe('ProductDescription', () => {
  it('renders the product description as input value', () => {
    render(<ProductDescription product={baseProduct} editMode={true} />);
    expect(screen.getByDisplayValue('Initial description')).toBeTruthy();
  });

  it('renders placeholder when description is empty', () => {
    const product = { ...baseProduct, description: undefined };
    render(<ProductDescription product={product} editMode={true} />);
    expect(screen.getByPlaceholderText('Add a product description')).toBeTruthy();
  });

  it('calls onChangeDescription on blur', () => {
    const onChangeDescription = jest.fn();
    render(<ProductDescription product={baseProduct} editMode={true} onChangeDescription={onChangeDescription} />);
    const input = screen.getByDisplayValue('Initial description');
    fireEvent.changeText(input, 'New description');
    fireEvent(input, 'blur');
    expect(onChangeDescription).toHaveBeenCalledWith('New description');
  });

  it('is not editable when editMode is false', () => {
    render(<ProductDescription product={baseProduct} editMode={false} />);
    const input = screen.getByDisplayValue('Initial description');
    expect(input.props.editable).toBe(false);
  });
});
