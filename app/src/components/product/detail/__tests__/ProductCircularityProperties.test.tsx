import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import ProductCircularityProperties from '@/components/product/detail/ProductCircularityProperties';
import { baseProduct as _base, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';

const emptyCircularity = {
  recyclability: null,
  disassemblability: null,
  remanufacturability: null,
};

const baseProduct: Product = { ..._base, circularityProperties: emptyCircularity };

describe('ProductCircularityProperties', () => {
  // The "Circularity" heading itself is rendered by the wrapping Section, not
  // this component — verify only the toggle it owns.
  it('renders the collapse/expand toggle collapsed by default', () => {
    renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={false} />);

    expect(screen.getByText('Show')).toBeOnTheScreen();
  });

  it("shows 'No associated circularity properties' in view mode with empty data", () => {
    renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={false} />);

    expect(screen.getByText('No associated circularity properties.')).toBeOnTheScreen();
  });

  it('summarizes hidden notes when collapsed', () => {
    renderWithProviders(
      <ProductCircularityProperties
        product={{
          ...baseProduct,
          circularityProperties: { ...emptyCircularity, recyclability: 'Easy to recycle' },
        }}
        editMode={false}
      />,
    );

    expect(screen.getByText('1 property hidden.')).toBeOnTheScreen();
  });

  it('shows only notes with content in view mode', () => {
    renderWithProviders(
      <ProductCircularityProperties
        product={{
          ...baseProduct,
          circularityProperties: {
            ...emptyCircularity,
            recyclability: 'Easy to recycle',
            remanufacturability: 'Housing can be reused',
          },
        }}
        editMode={false}
      />,
    );

    fireEvent.press(screen.getByText('Show'));

    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
    expect(screen.getByText('Easy to recycle')).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability')).toBeOnTheScreen();
    expect(screen.queryByText('Disassemblability')).toBeNull();
  });

  it('shows three optional note inputs in edit mode', () => {
    const { UNSAFE_root } = renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={true} />,
    );

    // No 'Show' press: edit mode mounts expanded (see ProductCircularityProperties).
    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
    expect(screen.getByText('Disassemblability')).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability')).toBeOnTheScreen();
    expect(UNSAFE_root.findAllByType(TextInput)).toHaveLength(3);
    expect(
      UNSAFE_root.findAllByType(TextInput).map(
        (input: { props: { maxLength?: number } }) => input.props.maxLength,
      ),
    ).toEqual([500, 500, 500]);
  });

  it('updates a note field in edit mode', async () => {
    const onChange = jest.fn();
    const { UNSAFE_root } = renderWithProviders(
      <ProductCircularityProperties
        product={baseProduct}
        editMode={true}
        onChangeCircularityProperties={onChange}
      />,
    );

    const inputs = UNSAFE_root.findAllByType(TextInput);
    fireEvent.changeText(inputs[1], 'Fasteners are accessible');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        ...emptyCircularity,
        disassemblability: 'Fasteners are accessible',
      });
    });
  });

  it('collapses again when Hide is pressed', () => {
    renderWithProviders(
      <ProductCircularityProperties
        product={{
          ...baseProduct,
          circularityProperties: { ...emptyCircularity, recyclability: 'Observed' },
        }}
        editMode={false}
      />,
    );

    fireEvent.press(screen.getByText('Show'));
    expect(screen.getByText('Hide')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Hide'));

    expect(screen.getByText('1 property hidden.')).toBeOnTheScreen();
  });
});

it('mounts expanded in edit mode and collapsed in view mode', () => {
  // Regression: collapsed-by-default made Section's "Add circularity notes"
  // ghost row open onto "No associated circularity properties." plus a Show
  // link — a request to add answered with a statement that there is nothing.
  renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={true} />);
  expect(screen.getByText('Recyclability')).toBeOnTheScreen();
  expect(screen.queryByText('No associated circularity properties.')).toBeNull();

  screen.unmount();

  renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={false} />);
  expect(screen.queryByText('Recyclability')).toBeNull();
});
