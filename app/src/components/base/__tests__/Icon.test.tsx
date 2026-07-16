import { render } from '@testing-library/react-native';
import { Svg } from 'react-native-svg';
import { Icon } from '@/components/base/Icon';

test('renders a mapped lucide glyph with tokenised size', () => {
  const { UNSAFE_root } = render(<Icon name="close" size="md" />);
  const svg = UNSAFE_root.findByType(Svg);
  expect(svg.props.width).toBe(20);
  expect(svg.props.height).toBe(20);
});

test('defaults to md size and 2px stroke width', () => {
  const { UNSAFE_root } = render(<Icon name="close" />);
  const svg = UNSAFE_root.findByType(Svg);
  expect(svg.props.width).toBe(20);
  expect(svg.props.strokeWidth).toBe(2);
});

test('accepts a raw numeric size and custom stroke width', () => {
  const { UNSAFE_root } = render(<Icon name="close" size={32} strokeWidth={1.5} />);
  const svg = UNSAFE_root.findByType(Svg);
  expect(svg.props.width).toBe(32);
  expect(svg.props.strokeWidth).toBe(1.5);
});

test('passes the color prop straight through', () => {
  const { UNSAFE_root } = render(<Icon name="close" color="#123456" />);
  const svg = UNSAFE_root.findByType(Svg);
  expect(svg.props.stroke).toBe('#123456');
});

test('unknown names fail typecheck (compile-time)', () => {
  // @ts-expect-error not in the name map
  render(<Icon name="definitely-not-a-glyph" />);
});
