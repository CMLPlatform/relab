import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProductCard from '../ProductCard';
import { Product } from '@/types/Product';
import { useRouter } from 'expo-router';

jest.mock('expo-router');

describe('ProductCard Component', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockProduct: Required<Product> = {
    id: 1,
    name: 'Test Product',
    brand: 'Test Brand',
    model: 'Model X',
    description: 'A test product description',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-02',
    productTypeID: 1,
    componentIDs: [1, 2, 3],
    physicalProperties: {
      weight: 100,
      width: 10,
      height: 20,
      depth: 30,
    },
    images: [],
    ownedBy: 'me',
    parentID: undefined,
    amountInParent: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it('should render product information correctly', () => {
    const { getByText } = render(<ProductCard product={mockProduct} />);
    expect(getByText('Test Product')).toBeTruthy();
    expect(getByText('A test product description')).toBeTruthy();
    expect(getByText(/Test Brand/)).toBeTruthy();
    expect(getByText(/3 components/)).toBeTruthy();
  });

  it('should handle empty/missing data gracefully', () => {
    const product = { ...mockProduct, name: '', description: '', componentIDs: [] };
    const { getByText } = render(<ProductCard product={product} />);
    expect(getByText('Unnamed Product')).toBeTruthy();
    expect(getByText('No description provided.')).toBeTruthy();
  });

  it('should navigate to product detail when pressed', () => {
    const { getByText } = render(<ProductCard product={mockProduct} />);
    fireEvent.press(getByText('Test Product'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: 1 },
    });
  });

  it('should not navigate when disabled', () => {
    const { getByText } = render(<ProductCard product={mockProduct} enabled={false} />);
    fireEvent.press(getByText('Test Product'));

    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
