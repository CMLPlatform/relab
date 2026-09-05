import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SpecHeader } from '@/components/product/detail/SpecHeader';
import { formatWeight } from '@/components/product/detail/spec-utils';
import { baseProduct } from '@/test-utils/fixtures';
import { getAppTheme } from '@/theme';

const IDENTITY_PATTERN = /Vitra · T2/;

test('formatWeight keeps grams, the unit the field is entered and shown in', () => {
  expect(formatWeight(250)).toBe('250 g');
  expect(formatWeight(1200)).toBe('1200 g');
});

test('renders name, identity line, and facts that exist', () => {
  render(
    <SpecHeader
      product={{
        ...baseProduct,
        name: 'Office chair',
        brand: 'Vitra',
        model: 'T2',
        productTypeName: 'Furniture',
        components: [{ id: 2 }, { id: 3 }] as never,
        physicalProperties: { weight: 12000, width: 80, height: 90, depth: 70 },
      }}
    />,
  );
  expect(screen.getByText('Office chair')).toBeOnTheScreen();
  expect(screen.getByText(IDENTITY_PATTERN)).toBeOnTheScreen();
  expect(screen.getByText('12000 g')).toBeOnTheScreen();
  expect(screen.getByText('80×90×70 cm')).toBeOnTheScreen();
  expect(screen.getByText('2')).toBeOnTheScreen();
});

test('renders no facts row segments for missing data', () => {
  render(
    <SpecHeader
      product={{
        ...baseProduct,
        name: 'Kettle',
        brand: undefined,
        model: undefined,
        productTypeName: undefined,
        components: undefined,
        physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
      }}
    />,
  );
  expect(screen.getByText('Kettle')).toBeOnTheScreen();
  expect(screen.queryByText('Weight')).toBeNull();
  expect(screen.queryByText('Components')).toBeNull();
});

// In edit mode the display-size name is the control — one name field, and it
// is the biggest text on the screen. (Moved here from ProductNameHeader, which
// used to carry a second, 16px copy in the stack header.)
describe('SpecHeader name field in edit mode', () => {
  const product = { ...baseProduct, name: 'Initial product name' };

  test('renders the name as a display-scale input', () => {
    render(<SpecHeader product={product} editMode />);
    const input = screen.getByLabelText('Product name');
    expect(input.props.value).toBe('Initial product name');
    expect(StyleSheet.flatten(input.props.style).fontSize).toBe(
      getAppTheme('light').tokens.type.display.fontSize,
    );
  });

  test('preserves an in-progress draft when the product hydrates mid-edit', () => {
    const { rerender } = render(<SpecHeader product={product} editMode />);
    fireEvent.changeText(screen.getByLabelText('Product name'), 'Unsaved draft');
    rerender(<SpecHeader product={{ ...product, name: 'Hydrated name' }} editMode />);
    expect(screen.getByDisplayValue('Unsaved draft')).toBeOnTheScreen();
  });

  test('calls onNameChange with the trimmed draft on blur', () => {
    const onNameChange = jest.fn();
    render(<SpecHeader product={product} editMode onNameChange={onNameChange} />);
    const input = screen.getByLabelText('Product name');
    fireEvent.changeText(input, '  Updated product name  ');
    fireEvent(input, 'blur');
    expect(onNameChange).toHaveBeenCalledWith('Updated product name');
  });

  test('announces a validation error for a too-short name', () => {
    render(<SpecHeader product={product} editMode />);
    fireEvent.changeText(screen.getByLabelText('Product name'), 'A');
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  test('renders plain text, not an input, in view mode', () => {
    render(<SpecHeader product={product} editMode={false} />);
    expect(screen.queryByLabelText('Product name')).toBeNull();
    expect(screen.getByText('Initial product name')).toBeOnTheScreen();
  });
});
