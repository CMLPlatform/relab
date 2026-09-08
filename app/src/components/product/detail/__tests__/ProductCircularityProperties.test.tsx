import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ProductCircularityProperties from '@/components/product/detail/ProductCircularityProperties';
import { baseProduct as _base, queryAllHostsByType, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';

const emptyCircularity = {
  recyclability: null,
  disassemblability: null,
  remanufacturability: null,
};

const baseProduct: Product = { ..._base, circularityProperties: emptyCircularity };

describe('ProductCircularityProperties', () => {
  it('renders all three rows in view mode, with a dash for unset notes', async () => {
    await renderWithProviders(
      <ProductCircularityProperties
        product={{
          ...baseProduct,
          circularityProperties: { ...emptyCircularity, recyclability: 'Easy to recycle' },
        }}
        editMode={false}
      />,
    );

    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
    expect(screen.getByText('Easy to recycle')).toBeOnTheScreen();
    expect(screen.getByText('Disassemblability')).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability')).toBeOnTheScreen();
    expect(screen.getAllByText('—')).toHaveLength(2);
    // No disclosure: nothing to expand.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows three optional note inputs in edit mode', async () => {
    await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={true} />,
    );

    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
    expect(screen.getByText('Disassemblability')).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability')).toBeOnTheScreen();
    expect(queryAllHostsByType('TextInput')).toHaveLength(3);
    expect(
      queryAllHostsByType('TextInput').map(
        (input: { props: { maxLength?: number } }) => input.props.maxLength,
      ),
    ).toEqual([500, 500, 500]);
    expect(screen.queryByText('—')).toBeNull();
  });

  it('commits a note field on blur in edit mode', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <ProductCircularityProperties
        product={baseProduct}
        editMode={true}
        onChangeCircularityProperties={onChange}
      />,
    );

    const inputs = queryAllHostsByType('TextInput');
    await fireEvent.changeText(inputs[1], 'Fasteners are accessible');
    // Typing alone commits nothing; blur does (the commit is the blur-save trigger).
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(inputs[1], 'blur');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        ...emptyCircularity,
        disassemblability: 'Fasteners are accessible',
      });
    });
  });

  it('uses the eyebrow ramp step for note labels (spec row)', async () => {
    await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={false} />,
    );

    expect(screen.getByText('Recyclability')).toHaveStyle({
      fontSize: 13,
      lineHeight: 18,
      textTransform: 'uppercase',
    });
  });
});
