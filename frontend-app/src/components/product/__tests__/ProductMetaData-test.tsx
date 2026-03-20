import { describe, it, expect } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ProductMetaData from '../ProductMetaData';
import type { Product } from '@/types/Product';

const baseProduct: Product = {
  id: 42,
  name: 'Test Product',
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
  return <PaperProvider>{children}</PaperProvider>;
}

describe('ProductMetaData', () => {
  it('shows the product ID', () => {
    render(
      <Wrapper>
        <ProductMetaData product={baseProduct} />
      </Wrapper>,
    );
    expect(screen.getByText(/Product ID: 42/)).toBeTruthy();
  });

  it('shows creation date when createdAt is present', () => {
    const product = { ...baseProduct, createdAt: '2024-01-15T00:00:00Z' };
    render(
      <Wrapper>
        <ProductMetaData product={product} />
      </Wrapper>,
    );
    expect(screen.getByText(/Created:/)).toBeTruthy();
  });

  it('shows updated date when updatedAt is present', () => {
    const product = { ...baseProduct, updatedAt: '2024-06-01T00:00:00Z' };
    render(
      <Wrapper>
        <ProductMetaData product={product} />
      </Wrapper>,
    );
    expect(screen.getByText(/Last Updated:/)).toBeTruthy();
  });

  it('does not show creation date when createdAt is absent', () => {
    render(
      <Wrapper>
        <ProductMetaData product={baseProduct} />
      </Wrapper>,
    );
    expect(screen.queryByText(/Created:/)).toBeNull();
  });

  it('does not show updated date when updatedAt is absent', () => {
    render(
      <Wrapper>
        <ProductMetaData product={baseProduct} />
      </Wrapper>,
    );
    expect(screen.queryByText(/Last Updated:/)).toBeNull();
  });
});
