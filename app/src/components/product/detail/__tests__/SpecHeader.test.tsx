import { render, screen } from '@testing-library/react-native';
import { SpecHeader } from '@/components/product/detail/SpecHeader';
import { formatWeight } from '@/components/product/detail/spec-utils';
import { baseProduct } from '@/test-utils/fixtures';

const IDENTITY_PATTERN = /Vitra · T2/;

test('formatWeight renders grams and kilograms', () => {
  expect(formatWeight(250)).toBe('250 g');
  expect(formatWeight(1200)).toBe('1.2 kg');
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
  expect(screen.getByText('12 kg')).toBeOnTheScreen();
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
