import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { ProductImagePlaceholder } from '@/components/product/gallery/ProductImagePlaceholder';

describe('ProductImagePlaceholder', () => {
  it('names the empty slot rather than repeating the record name', async () => {
    await render(<ProductImagePlaceholder width={240} />);

    expect(screen.getByTestId('image-placeholder')).toBeOnTheScreen();
    expect(screen.getByText('No photos yet')).toBeOnTheScreen();
  });
});
