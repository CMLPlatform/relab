import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import ProductCard from '../ProductCard';

// Mock the Product type
const mockProduct = {
  id: '1',
  name: 'Test Product',
  brand: 'Acme Corp',
  model: 'V1',
  description: 'A very nice testing product',
  componentIDs: ['c1', 'c2'],
} as any;

describe('ProductCard', () => {
  it('renders correctly with full product details', () => {
    // Basic render test
    render(<ProductCard product={mockProduct} />);

    // Check title renders
    expect(screen.getByText('Test Product')).toBeTruthy();
    // Check description renders
    expect(screen.getByText('A very nice testing product')).toBeTruthy();
    // Check composed details string
    expect(screen.getByText('Acme Corp • V1 • 2 components')).toBeTruthy();
  });

  it('handles missing optional product details gracefully', () => {
    const minimalProduct = {
      id: '2',
      name: '',
      brand: 'BrandX',
      model: '',
      componentIDs: [],
    };
    render(<ProductCard product={minimalProduct as any} />);

    expect(screen.getByText('Unnamed Product')).toBeTruthy();
    expect(screen.getByText('No description provided.')).toBeTruthy();
  });

  it('can be pressed when enabled', () => {
    // You can also mock useRouter from expo-router here to verify push gets called
    // (See jest.setup.ts for the global router mock)
    const { getByText } = render(<ProductCard product={mockProduct as any} />);
    const cardText = getByText('Test Product');

    // Bubble up to pressable parent
    fireEvent.press(cardText);
    // Since the actual action uses router, the assertion would check router.push
    // e.g., expect(mockRouter.push).toHaveBeenCalledWith(...)
  });
});
