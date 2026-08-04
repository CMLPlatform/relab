import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '@/components/base/Card';

const SHADOW_CLASS_PATTERN = /\bshadow-(sm|md|lg|xl)\b/;

test('renders children with the card surface classes', () => {
  render(
    <Card>
      <Text>Hello</Text>
    </Card>,
  );
  expect(screen.getByText('Hello')).toBeOnTheScreen();
});

test('merges caller className with the base surface classes', () => {
  render(
    <Card className="mx-4" testID="card">
      <Text>Hello</Text>
    </Card>,
  );
  const className = screen.getByTestId('card').props.className;
  expect(className).toEqual(expect.stringContaining('bg-card'));
  expect(className).toEqual(expect.stringContaining('border-border'));
  expect(className).toEqual(expect.stringContaining('rounded-lg'));
  expect(className).toEqual(expect.stringContaining('mx-4'));
});

// DESIGN.md "Form language — Flat & Sharp": inline surfaces are flat — a hairline
// border + surface fill, no shadow. Only floating surfaces get the overlay tier.
// (Tailwind's rounded-lg === 8px === DESIGN.md radius-card.)
test('Card is a flat hairline surface at the card radius', () => {
  render(
    <Card testID="card">
      <Text>Hello</Text>
    </Card>,
  );
  const className = screen.getByTestId('card').props.className;
  expect(className).not.toMatch(SHADOW_CLASS_PATTERN);
  expect(className).toEqual(expect.stringContaining('border'));
  expect(className).toEqual(expect.stringContaining('rounded-lg'));
});

test('forwards a style prop', () => {
  render(
    <Card style={{ marginHorizontal: 14 }} testID="card">
      <Text>Hello</Text>
    </Card>,
  );
  expect(screen.getByTestId('card').props.style).toEqual({ marginHorizontal: 14 });
});
