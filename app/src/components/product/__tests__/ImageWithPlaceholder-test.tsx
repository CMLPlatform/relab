import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { ProductImagePlaceholder } from '@/components/product/gallery/ProductImagePlaceholder';

describe('ProductImagePlaceholder', () => {
  it('renders the placeholder label for a product image slot', () => {
    render(<ProductImagePlaceholder width={240} label="Sample product" />);

    expect(screen.getByTestId('image-placeholder')).toBeOnTheScreen();
    expect(screen.getByText('Sample product')).toBeOnTheScreen();
  });
});
