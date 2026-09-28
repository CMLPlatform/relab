import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import ProductMaterials from '@/components/product/detail/ProductMaterials';
import { baseProduct, renderWithProviders } from '@/test-utils/index';
import type { Product, ProductMaterial } from '@/types/Product';

const aluminum: ProductMaterial = {
  materialID: 7,
  name: 'Aluminum',
  quantity: 0.5,
  unit: 'kg',
  source: 'https://example.com/aluminum',
};

function withMaterials(materials: Product['materials']): Product {
  return { ...baseProduct, materials };
}

describe('ProductMaterials', () => {
  // A heading like its Measurements and Circularity notes siblings, not a toggle.
  it('shows the heading, count and an empty line when nothing is recorded', async () => {
    await renderWithProviders(<ProductMaterials product={withMaterials([])} />);

    expect(screen.getByRole('header', { name: 'Materials' })).toBeOnTheScreen();
    expect(screen.getByText('(0)')).toBeOnTheScreen();
    expect(screen.getByText('No materials recorded yet.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lists the recorded quantity, unit and material reference', async () => {
    await renderWithProviders(<ProductMaterials product={withMaterials([aluminum])} />);

    expect(screen.getByRole('header', { name: 'Materials' })).toBeOnTheScreen();
    expect(screen.getByText('(1)')).toBeOnTheScreen();
    expect(screen.getByText('Aluminum')).toBeOnTheScreen();
    expect(screen.getByText('0.5 kg')).toBeOnTheScreen();
    expect(screen.getByText('Material reference: https://example.com/aluminum')).toBeOnTheScreen();
  });

  // Uncertainty is data: a missing reference is stated plainly, never as a warning.
  it('states a missing material reference without flagging it', async () => {
    await renderWithProviders(
      <ProductMaterials product={withMaterials([{ ...aluminum, source: undefined }])} />,
    );

    expect(screen.getByText('No reference recorded for this material.')).toBeOnTheScreen();
  });

  it('renders nothing for a record whose materials were never loaded', async () => {
    await renderWithProviders(<ProductMaterials product={withMaterials(undefined)} />);

    expect(screen.queryByText('Materials')).toBeNull();
  });
});
