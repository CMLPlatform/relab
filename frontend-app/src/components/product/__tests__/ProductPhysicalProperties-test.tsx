import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ProductPhysicalProperties from '../ProductPhysicalProperties';
import type { Product } from '@/types/Product';

// Mock SVGCube to avoid react-native-svg in tests
jest.mock('@/components/common/SVGCube', () => 'SVGCube');

const baseProduct: Product = {
  id: 1,
  name: 'Test',
  componentIDs: [],
  physicalProperties: { weight: 500, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('ProductPhysicalProperties', () => {
  it('renders all four property labels', () => {
    render(
      <Wrapper>
        <ProductPhysicalProperties product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.getByText('Height')).toBeTruthy();
    expect(screen.getByText('Width')).toBeTruthy();
    expect(screen.getByText('Depth')).toBeTruthy();
  });

  it('renders current weight value', () => {
    render(
      <Wrapper>
        <ProductPhysicalProperties product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue('500')).toBeTruthy();
  });

  it('calls onChangePhysicalProperties when a value changes', () => {
    const onChangePhysicalProperties = jest.fn();
    render(
      <Wrapper>
        <ProductPhysicalProperties
          product={baseProduct}
          editMode={true}
          onChangePhysicalProperties={onChangePhysicalProperties}
        />
      </Wrapper>,
    );
    const weightInput = screen.getByDisplayValue('500');
    fireEvent.changeText(weightInput, '750');
    fireEvent(weightInput, 'blur');
    expect(onChangePhysicalProperties).toHaveBeenCalledWith(expect.objectContaining({ weight: 750 }));
  });

  it('inputs are not editable when editMode is false', () => {
    render(
      <Wrapper>
        <ProductPhysicalProperties product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    const weightInput = screen.getByDisplayValue('500');
    expect(weightInput.props.editable).toBe(false);
  });
});
