import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import ProductPhysicalProperties from '../ProductPhysicalProperties';
import { renderWithProviders, baseProduct as _base } from '@/test-utils';
import type { Product } from '@/types/Product';

// Mock SVGCube to avoid react-native-svg in tests
jest.mock('@/components/common/SVGCube', () => 'SVGCube');

const baseProduct: Product = { ..._base, physicalProperties: { width: 10, height: 5, depth: 3, weight: 500 } };

describe('ProductPhysicalProperties', () => {
  it('renders all four property labels', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.getByText('Height')).toBeTruthy();
    expect(screen.getByText('Width')).toBeTruthy();
    expect(screen.getByText('Depth')).toBeTruthy();
  });

  it('renders current weight value', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    expect(screen.getByDisplayValue('500')).toBeTruthy();
  });

  it('calls onChangePhysicalProperties when a value changes', () => {
    const onChangePhysicalProperties = jest.fn();
    renderWithProviders(
      <ProductPhysicalProperties
        product={baseProduct}
        editMode={true}
        onChangePhysicalProperties={onChangePhysicalProperties}
      />,
    );
    const weightInput = screen.getByDisplayValue('500');
    fireEvent.changeText(weightInput, '750');
    fireEvent(weightInput, 'blur');
    expect(onChangePhysicalProperties).toHaveBeenCalledWith(expect.objectContaining({ weight: 750 }));
  });

  it('inputs are not editable when editMode is false', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={false} />);
    const weightInput = screen.getByDisplayValue('500');
    expect(weightInput.props.editable).toBe(false);
  });
});
