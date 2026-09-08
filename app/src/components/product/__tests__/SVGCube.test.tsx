import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { MAX_LABEL_WIDTH, VIEW_BOX } from '@/components/product/cubeLayout';
import Cube from '@/components/product/SVGCube';
import { renderWithProviders } from '@/test-utils/index';

describe('SVGCube presentations', () => {
  it('uses a shorter frame in compact mode without dropping dimension labels', async () => {
    await renderWithProviders(<Cube width={10} height={5} depth={3} compact />);

    const drawing = screen.getByLabelText(
      'Scale drawing of the product: width 10 centimetres, height 5 centimetres, depth 3 centimetres',
    );
    expect(drawing.props.height).toBe(132);
  });

  it('preserves the existing full-height view presentation by default', async () => {
    await renderWithProviders(<Cube width={10} height={5} depth={3} />);

    expect(
      screen.getByLabelText(
        'Scale drawing of the product: width 10 centimetres, height 5 centimetres, depth 3 centimetres',
      ).props.height,
    ).toBe(210);
  });

  it('leaves a left gutter wide enough for a three-figure height label', async () => {
    await renderWithProviders(<Cube width={10} height={123.45} depth={3} />);

    const drawing = screen.getByLabelText(
      'Scale drawing of the product: width 10 centimetres, height 123.45 centimetres, depth 3 centimetres',
    );
    // The height label ends 15 units left of the shape's origin; the viewBox
    // must start at least a full label further left or the value truncates.
    expect(drawing).toBeOnTheScreen();
    const minX = Number(VIEW_BOX.split(' ')[0]);
    expect(minX).toBeLessThanOrEqual(-(15 + MAX_LABEL_WIDTH));
    expect(MAX_LABEL_WIDTH).toBeGreaterThanOrEqual('123.45 cm'.length * 7);
  });
});
