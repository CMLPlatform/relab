import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import ProductDetailsSkeleton from '@/components/product/ProductDetailsSkeleton';
import { renderWithProviders } from '@/test-utils/render';

describe('ProductDetailsSkeleton', () => {
  it('tells assistive tech the record is loading', async () => {
    await renderWithProviders(<ProductDetailsSkeleton />);
    expect(screen.getByRole('progressbar', { name: 'Loading details' })).toBeOnTheScreen();
  });
});
