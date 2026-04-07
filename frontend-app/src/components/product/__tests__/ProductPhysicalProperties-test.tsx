import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { baseProduct as _base, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductPhysicalProperties from '../ProductPhysicalProperties';

// Mock SVGCube to avoid react-native-svg in tests
jest.mock('@/components/common/SVGCube', () => 'SVGCube');

const baseProduct: Product = {
  ..._base,
  physicalProperties: { width: 10, height: 5, depth: 3, weight: 500 },
};

describe('ProductPhysicalProperties', () => {
  it('renders all four property labels', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    expect(screen.getByText('Weight')).toBeOnTheScreen();
    expect(screen.getByText('Height')).toBeOnTheScreen();
    expect(screen.getByText('Width')).toBeOnTheScreen();
    expect(screen.getByText('Depth')).toBeOnTheScreen();
  });

  it('renders current weight value', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    expect(screen.getByDisplayValue('500')).toBeOnTheScreen();
  });

  it('calls onChangePhysicalProperties when a value changes', () => {
    const onChangePhysicalProperties = jest.fn();
    renderWithProviders(
      <ProductPhysicalProperties
        product={baseProduct}
        editMode={true}
        onChangePhysicalProperties={onChangePhysicalProperties}
      />,
    );
    const weightInput = screen.getByDisplayValue('500');
    fireEvent.changeText(weightInput, '750');
    fireEvent(weightInput, 'blur');
    expect(onChangePhysicalProperties).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 750 }),
    );
  });

  it('inputs are not editable when editMode is false', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={false} />);
    const weightInput = screen.getByDisplayValue('500');
    expect(weightInput.props.editable).toBe(false);
  });
});
