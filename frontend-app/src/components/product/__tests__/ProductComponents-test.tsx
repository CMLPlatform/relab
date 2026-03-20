import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import ProductComponents from '../ProductComponents';
import { DialogProvider } from '@/components/common/DialogProvider';
import * as fetching from '@/services/api/fetching';
import type { Product } from '@/types/Product';

jest.mock('@/services/api/fetching', () => ({
  productComponents: jest.fn(),
}));

jest.mock('@/components/common/ProductCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ product }: { product: { name: string } }) => React.createElement(Text, null, product.name);
});

const mockPush = jest.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PaperProvider>
      <DialogProvider>{children}</DialogProvider>
    </PaperProvider>
  );
}

const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  productTypeID: undefined,
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

describe('ProductComponents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (fetching.productComponents as jest.Mock).mockResolvedValue([]);
  });

  it('renders the Components heading', async () => {
    render(
      <Wrapper>
        <ProductComponents product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    await screen.findByText(/Components \(0\)/);
  });

  it("shows 'no subcomponents' message when empty", async () => {
    render(
      <Wrapper>
        <ProductComponents product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('This product has no subcomponents.')).toBeTruthy();
    });
  });

  it('renders component cards when components are loaded', async () => {
    const componentProduct: Product = { ...baseProduct, id: 2, name: 'Sub Component' };
    (fetching.productComponents as jest.Mock).mockResolvedValue([componentProduct]);
    render(
      <Wrapper>
        <ProductComponents product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Sub Component')).toBeTruthy();
    });
  });

  it('shows Add component button when owned by me and not in editMode', async () => {
    render(
      <Wrapper>
        <ProductComponents product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Add component')).toBeTruthy();
    });
  });

  it('hides Add component button in editMode', async () => {
    render(
      <Wrapper>
        <ProductComponents product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.queryByText('Add component')).toBeNull();
    });
  });

  it('hides Add component button when not owned by me', async () => {
    const notMine = { ...baseProduct, ownedBy: 'other' };
    render(
      <Wrapper>
        <ProductComponents product={notMine} editMode={false} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.queryByText('Add component')).toBeNull();
    });
  });

  it('opens create component dialog when Add component is pressed', async () => {
    render(
      <Wrapper>
        <ProductComponents product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    await screen.findByText('Add component');
    fireEvent.press(screen.getByText('Add component'));
    await waitFor(() => {
      expect(screen.getByText('Create New Component')).toBeTruthy();
    });
  });
});
