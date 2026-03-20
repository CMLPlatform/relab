import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ProductDelete from '../ProductDelete';
import { DialogProvider } from '@/components/common/DialogProvider';
import type { Product } from '@/types/Product';

const existingProduct: Product = {
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
  return (
    <PaperProvider>
      <DialogProvider>{children}</DialogProvider>
    </PaperProvider>
  );
}

describe('ProductDelete', () => {
  it("returns null when product.id is 'new'", () => {
    const product = { ...existingProduct, id: 'new' as const };
    render(
      <Wrapper>
        <ProductDelete product={product} editMode={true} />
      </Wrapper>,
    );
    expect(screen.queryByText('Delete product')).toBeNull();
  });

  it('returns null when editMode is false', () => {
    render(
      <Wrapper>
        <ProductDelete product={existingProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.queryByText('Delete product')).toBeNull();
  });

  it('renders the delete button for existing product in edit mode', () => {
    render(
      <Wrapper>
        <ProductDelete product={existingProduct} editMode={true} />
      </Wrapper>,
    );
    expect(screen.getByText('Delete product')).toBeTruthy();
  });

  it('shows confirmation dialog when delete button is pressed', async () => {
    render(
      <Wrapper>
        <ProductDelete product={existingProduct} editMode={true} />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Delete product'));
    });

    expect(screen.getByText('Delete Product')).toBeTruthy();
    expect(screen.getByText(/Are you sure/)).toBeTruthy();
  });

  it('calls onDelete when Delete button in dialog is pressed', async () => {
    const onDelete = jest.fn();
    render(
      <Wrapper>
        <ProductDelete product={existingProduct} editMode={true} onDelete={onDelete} />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Delete product'));
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Delete'));
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
