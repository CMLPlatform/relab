import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import ProductPhysicalProperties from '@/components/product/detail/ProductPhysicalProperties';
import { baseProduct as _base, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';

// Mock SVGCube to avoid react-native-svg in tests
jest.mock('@/components/base/SVGCube', () => 'SVGCube');

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

  // The rows come from Object.keys(physicalProperties), so an unmeasured
  // property must stay a present key holding undefined — dropping the key
  // would silently render fewer rows, and an empty field must not read "NaN".
  it('renders all four rows as empty for a fully unmeasured product', () => {
    const unmeasured: Product = {
      ..._base,
      physicalProperties: {
        width: undefined,
        height: undefined,
        depth: undefined,
        weight: undefined,
      },
    };
    renderWithProviders(<ProductPhysicalProperties product={unmeasured} editMode={true} />);

    for (const label of ['Weight', 'Height', 'Width', 'Depth']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByDisplayValue('NaN')).toBeNull();
    expect(screen.getAllByDisplayValue('')).toHaveLength(4);
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
    // Assert the whole object, not objectContaining: dropping the `...spread` in
    // the change handler would wipe the other three dimensions, and
    // objectContaining({ weight: 750 }) would happily pass.
    expect(onChangePhysicalProperties).toHaveBeenCalledWith({
      width: 10,
      height: 5,
      depth: 3,
      weight: 750,
    });
  });

  it('inputs are not editable when editMode is false', () => {
    renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={false} />);
    const weightInput = screen.getByDisplayValue('500');
    expect(weightInput.props.editable).toBe(false);
  });
});
