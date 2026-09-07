import { render } from '@testing-library/react-native';
import { Icon } from '@/components/base/Icon';
import { getHostByType } from '@/test-utils';

test('renders a mapped lucide glyph with tokenised size', async () => {
  await render(<Icon name="x" size="md" />);
  const svg = getHostByType('RNSVGSvgView');
  expect(svg.props.width).toBe(20);
  expect(svg.props.height).toBe(20);
});

test('defaults to md size and 2px stroke width', async () => {
  await render(<Icon name="x" />);
  const svg = getHostByType('RNSVGSvgView');
  expect(svg.props.width).toBe(20);
  expect(svg.props.strokeWidth).toBe(2);
});

test('accepts a raw numeric size and custom stroke width', async () => {
  await render(<Icon name="x" size={32} strokeWidth={1.5} />);
  const svg = getHostByType('RNSVGSvgView');
  expect(svg.props.width).toBe(32);
  expect(svg.props.strokeWidth).toBe(1.5);
});

test('passes the color prop straight through', async () => {
  await render(<Icon name="x" color="#123456" />);
  const svg = getHostByType('RNSVGSvgView');
  expect(svg.props.stroke).toBe('#123456');
});

test('unknown names fail typecheck (compile-time)', async () => {
  // @ts-expect-error not in the name map
  await render(<Icon name="definitely-not-a-glyph" />);
});

test('renders a brand glyph as an Svg and respects a numeric size', async () => {
  await render(<Icon name="github" size={32} />);
  const svg = getHostByType('RNSVGSvgView');
  expect(svg.props.width).toBe(32);
  expect(svg.props.height).toBe(32);
});
