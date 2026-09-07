import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import ProductPhysicalProperties from '@/components/product/detail/ProductPhysicalProperties';
import { baseProduct as _base, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';

// Mock SVGCube to avoid react-native-svg in tests
jest.mock('@/components/product/SVGCube', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return function SVGCubeMock({ compact }: { compact?: boolean }) {
    return React.createElement(View, { testID: compact ? 'svg-cube-compact' : 'svg-cube-full' });
  };
});

const baseProduct: Product = {
  ..._base,
  physicalProperties: { width: 10, height: 5, depth: 3, weight: 500 },
};

describe('ProductPhysicalProperties', () => {
  it('renders all four property labels', async () => {
    await renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    expect(screen.getByText('Measurements')).toBeOnTheScreen();
    expect(screen.getByText('Weight')).toBeOnTheScreen();
    expect(screen.getByText('Height')).toBeOnTheScreen();
    expect(screen.getByText('Width')).toBeOnTheScreen();
    expect(screen.getByText('Depth')).toBeOnTheScreen();
  });

  it('renders current weight value', async () => {
    await renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    expect(screen.getByDisplayValue('500')).toBeOnTheScreen();
  });

  // The rows come from Object.keys(physicalProperties), so an unmeasured
  // property must stay a present key holding undefined — dropping the key
  // would silently render fewer rows, and an empty field must not read "NaN".
  it('renders all four rows as empty for a fully unmeasured product', async () => {
    const unmeasured: Product = {
      ..._base,
      physicalProperties: {
        width: undefined,
        height: undefined,
        depth: undefined,
        weight: undefined,
      },
    };
    await renderWithProviders(<ProductPhysicalProperties product={unmeasured} editMode={true} />);

    for (const label of ['Weight', 'Height', 'Width', 'Depth']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByDisplayValue('NaN')).toBeNull();
    expect(screen.getAllByDisplayValue('')).toHaveLength(4);
  });

  it('calls onChangePhysicalProperties when a value changes', async () => {
    const onChangePhysicalProperties = jest.fn();
    await renderWithProviders(
      <ProductPhysicalProperties
        product={baseProduct}
        editMode={true}
        onChangePhysicalProperties={onChangePhysicalProperties}
      />,
    );
    const weightInput = screen.getByDisplayValue('500');
    await fireEvent.changeText(weightInput, '750');
    await fireEvent(weightInput, 'blur');
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

  it('renders measurements as spec rows, not disabled inputs, when editMode is false', async () => {
    // View mode used to render a disabled TextInput per measurement, which reads
    // as a form control to assistive tech when there is nothing to fill in, and
    // missed the Spec Row treatment DESIGN.md calls the app's signature. The
    // value now renders as text with its unit.
    await renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={false} />);
    expect(screen.queryByDisplayValue('500')).toBeNull();
    expect(screen.getByText('500 g')).toBeOnTheScreen();
  });

  it('renders editable inputs when editMode is true', async () => {
    await renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={true} />);
    const weightInput = screen.getByDisplayValue('500');
    expect(weightInput.props.editable).toBe(true);
    expect(screen.getByTestId('svg-cube-compact')).toBeOnTheScreen();
  });

  it('keeps the full cube presentation in view mode', async () => {
    await renderWithProviders(<ProductPhysicalProperties product={baseProduct} editMode={false} />);

    expect(screen.getByTestId('svg-cube-full')).toBeOnTheScreen();
  });
});

describe('ProductPhysicalProperties validation messages', () => {
  // A zero is the one invalid value the input will actually hand to the form:
  // the field pattern rejects a minus sign, and blank is allowed. Before this,
  // a zero looked identical to a valid entry and the only feedback was the save
  // FAB refusing to submit, with nothing naming the offending field.
  const zeroWeight: Product = {
    ..._base,
    physicalProperties: { width: 10, height: 5, depth: 3, weight: 0 },
  };

  it('links the weight error to its input for assistive technology', async () => {
    await renderWithProviders(<ProductPhysicalProperties product={zeroWeight} editMode={true} />);

    const message = screen.getByText('Weight must be a positive number');
    const input = screen.getByLabelText('Weight');

    expect(input.props.accessibilityDescribedBy).toBe(message.props.nativeID);
    expect(message.props.accessibilityRole).toBe('alert');
  });

  it('leaves the valid dimensions unflagged', async () => {
    await renderWithProviders(<ProductPhysicalProperties product={zeroWeight} editMode={true} />);

    expect(screen.queryByText('Height must be a positive number')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Height').props.accessibilityDescribedBy).toBeUndefined();
  });

  it('stays silent outside edit mode', async () => {
    // In read-only mode there is nothing for the user to correct, so an error
    // message would be noise on a product someone else has to fix.
    await renderWithProviders(<ProductPhysicalProperties product={zeroWeight} editMode={false} />);

    expect(screen.queryByText('Weight must be a positive number')).not.toBeOnTheScreen();
  });
});
