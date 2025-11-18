import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProductCard from '../ProductCard';
import { Product } from '@/types/Product';
import { useRouter } from 'expo-router';

jest.mock('expo-router');

describe('ProductCard Component', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
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

  it('should render product name', () => {
    const { getByText } = render(<ProductCard product={mockProduct} />);
    expect(getByText('Test Product')).toBeTruthy();
  });

  it('should render product description', () => {
    const { getByText } = render(<ProductCard product={mockProduct} />);
    expect(getByText('A test product description')).toBeTruthy();
  });

  it('should render brand and model in details', () => {
    const { getByText } = render(<ProductCard product={mockProduct} />);
    expect(getByText(/Test Brand/)).toBeTruthy();
    expect(getByText(/Model X/)).toBeTruthy();
  });

  it('should render component count when multiple components', () => {
    const { getByText } = render(<ProductCard product={mockProduct} />);
    expect(getByText(/3 components/)).toBeTruthy();
  });

  it('should render singular component when only one component', () => {
    const product = { ...mockProduct, componentIDs: [1] };
    const { getByText } = render(<ProductCard product={product} />);
    expect(getByText(/1 component/)).toBeTruthy();
  });

  it('should render "Unnamed Product" when name is empty', () => {
    const product = { ...mockProduct, name: '' };
    const { getByText } = render(<ProductCard product={product} />);
    expect(getByText('Unnamed Product')).toBeTruthy();
  });

  it('should render "No description provided." when description is missing', () => {
    const product = { ...mockProduct, description: '' };
    const { getByText } = render(<ProductCard product={product} />);
    expect(getByText('No description provided.')).toBeTruthy();
  });

  it('should navigate to product detail page when pressed', () => {
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

  it('should not render components info when no components', () => {
    const product = { ...mockProduct, componentIDs: [] };
    const { queryByText } = render(<ProductCard product={product} />);
    expect(queryByText(/components/)).toBeFalsy();
  });
});
