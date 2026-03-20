import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ProductCircularityProperties from '../ProductCircularityProperties';
import type { Product, CircularityProperties } from '@/types/Product';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

const emptyCircularity: CircularityProperties = {
  recyclabilityObservation: '',
  remanufacturabilityObservation: '',
  repairabilityObservation: '',
  recyclabilityComment: null,
  recyclabilityReference: null,
  remanufacturabilityComment: null,
  remanufacturabilityReference: null,
  repairabilityComment: null,
  repairabilityReference: null,
};

const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  productTypeID: undefined,
  componentIDs: [],
  physicalProperties: { weight: 100, width: 10, height: 5, depth: 3 },
  circularityProperties: emptyCircularity,
  images: [],
  videos: [],
  ownedBy: 'me',
};

describe('ProductCircularityProperties', () => {
  it('renders the section heading', () => {
    render(
      <Wrapper>
        <ProductCircularityProperties product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText(/Circularity Properties/)).toBeTruthy();
  });

  it("shows 'No associated circularity properties' in view mode with empty data", () => {
    render(
      <Wrapper>
        <ProductCircularityProperties product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('No associated circularity properties.')).toBeTruthy();
  });

  it('shows add-property chips in edit mode', () => {
    render(
      <Wrapper>
        <ProductCircularityProperties product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    expect(screen.getByText('Recyclability')).toBeTruthy();
    expect(screen.getByText('Remanufacturability')).toBeTruthy();
    expect(screen.getByText('Repairability')).toBeTruthy();
  });

  it('calls onChangeCircularityProperties when a chip is pressed in editMode', async () => {
    const onChange = jest.fn();
    render(
      <Wrapper>
        <ProductCircularityProperties product={baseProduct} editMode={true} onChangeCircularityProperties={onChange} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Recyclability'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });

  it('renders property section when property has data', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityComment: '',
        recyclabilityReference: '',
        recyclabilityObservation: '',
      },
    };
    render(
      <Wrapper>
        <ProductCircularityProperties product={productWithData} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Recyclability')).toBeTruthy();
  });

  it('renders property section header when property has observation content', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityComment: '',
        recyclabilityReference: '',
        recyclabilityObservation: 'Some observation',
      },
    };
    render(
      <Wrapper>
        <ProductCircularityProperties
          product={productWithData}
          editMode={true}
          onChangeCircularityProperties={jest.fn()}
        />
      </Wrapper>,
    );
    // The property header title "Recyclability" should be shown (not just the chip)
    const recyclabilityTexts = screen
      .UNSAFE_getAllByType(require('react-native').Text)
      .filter((el: any) => el.props.children === 'Recyclability');
    // At least one text with that label exists (in the expanded section header)
    expect(recyclabilityTexts.length).toBeGreaterThan(0);
  });

  it('calls onChangeCircularityProperties when chip is pressed to add recyclability', async () => {
    const onChange = jest.fn();
    render(
      <Wrapper>
        <ProductCircularityProperties product={baseProduct} editMode={true} onChangeCircularityProperties={onChange} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Recyclability'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          recyclabilityComment: '',
          recyclabilityReference: '',
          recyclabilityObservation: '',
        }),
      );
    });
  });
});
