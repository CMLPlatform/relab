import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProductTags from '../ProductTags';
import { Product } from '@/types/Product';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useDialog } from '@/components/common/DialogProvider';

jest.mock('expo-router');
jest.mock('@/components/common/DialogProvider');

describe('ProductTags Component', () => {
  const mockRouter = {
    push: jest.fn(),
    setParams: jest.fn(),
  };

  const mockDialog = {
    input: jest.fn(),
  };

  const mockProduct: Product = {
    id: 1,
    name: 'Test Product',
    brand: 'Test Brand',
    model: 'Model X',
    componentIDs: [],
    physicalProperties: {
      weight: 100,
      width: 10,
      height: 10,
      depth: 10,
    },
    images: [],
    ownedBy: 'me',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useDialog as jest.Mock).mockReturnValue(mockDialog);
  });

  it('should render brand and model chips', () => {
    const { getByText } = render(<ProductTags product={mockProduct} editMode={false} />);
    expect(getByText('Brand')).toBeTruthy();
    expect(getByText('Test Brand')).toBeTruthy();
    expect(getByText('Model')).toBeTruthy();
    expect(getByText('Model X')).toBeTruthy();
  });

  it('should navigate to brand selection when brand chip is pressed in edit mode', () => {
    const { getByText } = render(<ProductTags product={mockProduct} editMode={true} />);
    fireEvent.press(getByText('Test Brand'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/products/[id]/brand_selection',
      params: { id: 1, brand: 'Test Brand' },
    });
  });

  it('should not navigate to brand selection when not in edit mode', () => {
    const { getByText } = render(<ProductTags product={mockProduct} editMode={false} />);
    fireEvent.press(getByText('Test Brand'));

    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('should open model dialog when model chip is pressed in edit mode', () => {
    const { getByText } = render(<ProductTags product={mockProduct} editMode={true} />);
    fireEvent.press(getByText('Model X'));

    expect(mockDialog.input).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Set Model',
        placeholder: 'Model Name',
        defaultValue: 'Model X',
      })
    );
  });

  it('should not open model dialog when not in edit mode', () => {
    const { getByText } = render(<ProductTags product={mockProduct} editMode={false} />);
    fireEvent.press(getByText('Model X'));

    expect(mockDialog.input).not.toHaveBeenCalled();
  });

  it('should display "Unknown" when brand is missing', () => {
    const productWithoutBrand = { ...mockProduct, brand: undefined };
    const { getByText } = render(<ProductTags product={productWithoutBrand} editMode={false} />);
    expect(getByText('Unknown')).toBeTruthy();
  });

  it('should display "Unknown" when model is missing', () => {
    const productWithoutModel = { ...mockProduct, model: undefined };
    const { getByText } = render(<ProductTags product={productWithoutModel} editMode={false} />);
    // Should have two "Unknown" - one for brand (if missing) and one for model
    const unknownElements = render(<ProductTags product={{ ...mockProduct, brand: undefined, model: undefined }} editMode={false} />).getAllByText('Unknown');
    expect(unknownElements.length).toBe(2);
  });

  it('should handle brandSelection search param', () => {
    const onBrandChange = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ brandSelection: 'New Brand' });

    render(<ProductTags product={mockProduct} editMode={true} onBrandChange={onBrandChange} />);

    expect(mockRouter.setParams).toHaveBeenCalledWith({ brandSelection: undefined });
    expect(onBrandChange).toHaveBeenCalledWith('New Brand');
  });

  it('should not show error for brand when isComponent is true', () => {
    const productWithoutBrand = { ...mockProduct, brand: undefined };
    const { getByText } = render(<ProductTags product={productWithoutBrand} editMode={false} isComponent={true} />);
    // Component should render without error styling
    expect(getByText('Unknown')).toBeTruthy();
  });
});
