import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import Cube from '@/components/product/SVGCube';
import { renderWithProviders } from '@/test-utils/index';

describe('SVGCube presentations', () => {
  it('uses a shorter frame in compact mode without dropping dimension labels', () => {
    renderWithProviders(<Cube width={10} height={5} depth={3} compact />);

    const drawing = screen.getByLabelText(
      'Scale drawing of the product: width 10 centimetres, height 5 centimetres, depth 3 centimetres',
    );
    expect(drawing.props.height).toBe(132);
  });

  it('preserves the existing full-height view presentation by default', () => {
    renderWithProviders(<Cube width={10} height={5} depth={3} />);

    expect(
      screen.getByLabelText(
        'Scale drawing of the product: width 10 centimetres, height 5 centimetres, depth 3 centimetres',
      ).props.height,
    ).toBe(210);
  });
});
