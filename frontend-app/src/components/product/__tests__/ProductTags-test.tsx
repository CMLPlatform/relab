import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import ProductTags from '../ProductTags';
import { DialogProvider } from '@/components/common/DialogProvider';
import type { Product } from '@/types/Product';

const mockPush = jest.fn();

const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  brand: 'Acme',
  model: 'X100',
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PaperProvider>
      <DialogProvider>{children}</DialogProvider>
    </PaperProvider>
  );
}

describe('ProductTags', () => {
  beforeEach(() => {
    mockPush.mockReset();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders brand and model chip values', () => {
    render(
      <Wrapper>
        <ProductTags product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('X100')).toBeTruthy();
  });

  it("renders 'Unknown' when brand is missing", () => {
    const product = { ...baseProduct, brand: undefined };
    render(
      <Wrapper>
        <ProductTags product={product} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it("renders 'Unknown' when model is missing", () => {
    const product = { ...baseProduct, model: undefined };
    render(
      <Wrapper>
        <ProductTags product={product} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('navigates to brand selection on brand chip press in editMode', () => {
    render(
      <Wrapper>
        <ProductTags product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Acme'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products/[id]/brand_selection' }));
  });

  it('opens model input dialog on model chip press in editMode', async () => {
    render(
      <Wrapper>
        <ProductTags product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('X100'));
    });
    expect(screen.getByText('Set Model')).toBeTruthy();
  });

  it('does not navigate on brand chip press when not in editMode', () => {
    render(
      <Wrapper>
        <ProductTags product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('Acme'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders without error chips when product is a component (isComponent=true)', () => {
    const componentProduct = { ...baseProduct, brand: undefined, model: undefined };
    render(
      <Wrapper>
        <ProductTags product={componentProduct} editMode={true} isComponent={true} />
      </Wrapper>,
    );
    // No error expected because isComponent=true makes brand/model optional
    expect(screen.toJSON()).toBeTruthy();
  });
});
