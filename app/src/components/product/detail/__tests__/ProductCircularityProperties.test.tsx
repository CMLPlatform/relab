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
  // The disclosure is also the internal subheading, so its name stays stable
  // while accessibilityState carries expanded/collapsed state.
  it('renders the collapse/expand toggle collapsed by default', async () => {
    await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={false} />,
    );

    const toggle = screen.getByRole('button', { name: 'Circularity notes' });
    expect(toggle).toBeOnTheScreen();
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
  });

  it("shows 'No circularity notes yet' once expanded with empty data", async () => {
    await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={false} />,
    );

    await fireEvent.press(screen.getByText('Circularity notes'));
    expect(screen.getByText('No circularity notes yet.')).toBeOnTheScreen();
  });

  it('opens on the notes in view mode when the record has any, and summarizes them once hidden', async () => {
    await renderWithProviders(
      <ProductCircularityProperties
        product={{
          ...baseProduct,
          circularityProperties: { ...emptyCircularity, recyclability: 'Easy to recycle' },
        }}
        editMode={false}
      />,
    );

    expect(screen.getByText('Easy to recycle')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Circularity notes (1)' }).props.accessibilityState,
    ).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByText('Circularity notes (1)'));
    expect(screen.queryByText('Easy to recycle')).toBeNull();
    expect(screen.getByText('Circularity notes (1)')).toBeOnTheScreen();
  });

  it('shows only notes with content in view mode', async () => {
    await renderWithProviders(
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

    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
    expect(screen.getByText('Easy to recycle')).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability')).toBeOnTheScreen();
    expect(screen.queryByText('Disassemblability')).toBeNull();
  });

  it('shows three optional note inputs in edit mode', async () => {
    await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={true} />,
    );

    // No toggle press: edit mode mounts expanded (see ProductCircularityProperties).
    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
    expect(screen.getByText('Disassemblability')).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability')).toBeOnTheScreen();
    expect(queryAllHostsByType('TextInput')).toHaveLength(3);
    expect(
      queryAllHostsByType('TextInput').map(
        (input: { props: { maxLength?: number } }) => input.props.maxLength,
      ),
    ).toEqual([500, 500, 500]);
  });

  it('expands the circularity chunk when an existing view enters edit mode', async () => {
    const { rerender } = await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={false} />,
    );
    expect(
      screen.getByRole('button', { name: 'Circularity notes' }).props.accessibilityState,
    ).toMatchObject({ expanded: false });

    await rerender(<ProductCircularityProperties product={baseProduct} editMode={true} />);

    expect(
      screen.getByRole('button', { name: 'Circularity notes' }).props.accessibilityState,
    ).toMatchObject({ expanded: true });
    expect(screen.getByText('Recyclability')).toBeOnTheScreen();
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

  it('collapses again when Hide is pressed', async () => {
    await renderWithProviders(
      <ProductCircularityProperties
        product={{
          ...baseProduct,
          circularityProperties: { ...emptyCircularity, recyclability: 'Observed' },
        }}
        editMode={false}
      />,
    );

    await fireEvent.press(screen.getByText('Circularity notes (1)'));
    expect(screen.queryByText('Observed')).toBeNull();
    await fireEvent.press(screen.getByText('Circularity notes (1)'));

    expect(screen.getByText('Observed')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Circularity notes (1)' }).props.accessibilityState,
    ).toMatchObject({ expanded: true });
  });

  it('uses the heading type-ramp step for note labels', async () => {
    await renderWithProviders(
      <ProductCircularityProperties product={baseProduct} editMode={true} />,
    );

    expect(screen.getByText('Recyclability')).toHaveStyle({ fontSize: 19, lineHeight: 24 });
  });
});

it('mounts expanded in edit mode and collapsed in view mode', async () => {
  // Regression: collapsed-by-default made Section's "Add circularity notes"
  // ghost row open onto "No circularity notes yet." plus a Show
  // link — a request to add answered with a statement that there is nothing.
  await renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={true} />);
  expect(screen.getByText('Recyclability')).toBeOnTheScreen();
  expect(screen.queryByText('No circularity notes yet.')).toBeNull();

  await screen.unmount();

  await renderWithProviders(
    <ProductCircularityProperties product={baseProduct} editMode={false} />,
  );
  expect(screen.queryByText('Recyclability')).toBeNull();
});
