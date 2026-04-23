import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { baseProduct as _base, renderWithProviders } from '@/test-utils/index';
import type { CircularityProperties, Product } from '@/types/Product';
import ProductCircularityProperties from '../ProductCircularityProperties';

// Extended circularity object with all optional fields explicitly set to null,
// as required by the component's "property present" detection logic.
const emptyCircularity: CircularityProperties = {
  recyclabilityObservation: '',
  remanufacturabilityObservation: '',
  repairabilityObservation: '',
  recyclabilityComment: null,
  recyclabilityReference: null,
  remanufacturabilityComment: null,
  remanufacturabilityReference: null,
  repairabilityComment: null,
  repairabilityReference: null,
};

const baseProduct: Product = { ..._base, circularityProperties: emptyCircularity };
const CIRCULARITY_PROPERTIES_PATTERN = /Circularity Properties/;

describe('ProductCircularityProperties', () => {
  it('renders the section heading', () => {
    renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={false} />);
    expect(screen.getByText(CIRCULARITY_PROPERTIES_PATTERN)).toBeOnTheScreen();
    expect(screen.getByText('Show')).toBeOnTheScreen();
  });

  it("shows 'No associated circularity properties' in view mode with empty data", () => {
    renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={false} />);
    expect(screen.getByText('No associated circularity properties.')).toBeOnTheScreen();
  });

  it('shows add-property chips in edit mode', () => {
    renderWithProviders(<ProductCircularityProperties product={baseProduct} editMode={true} />);
    fireEvent.press(screen.getByText('Show'));
    expect(screen.getByText('Recyclability', { exact: false })).toBeOnTheScreen();
    expect(screen.getByText('Remanufacturability', { exact: false })).toBeOnTheScreen();
    expect(screen.getByText('Repairability', { exact: false })).toBeOnTheScreen();
  });

  it('renders property section when property has data', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityComment: '',
        recyclabilityReference: '',
        recyclabilityObservation: '',
      },
    };
    renderWithProviders(
      <ProductCircularityProperties product={productWithData} editMode={false} />,
    );
    expect(screen.getByText('1 property hidden.')).toBeOnTheScreen();
  });

  it('renders property section header when property has observation content', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityComment: '',
        recyclabilityReference: '',
        recyclabilityObservation: 'Some observation',
      },
    };
    renderWithProviders(
      <ProductCircularityProperties
        product={productWithData}
        editMode={true}
        onChangeCircularityProperties={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Show'));
    // The property header title "Recyclability" appears at least once (in the expanded section)
    expect(screen.getAllByText('Recyclability').length).toBeGreaterThan(0);
  });

  it('renders remanufacturability when only the comment field has content', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        remanufacturabilityComment: 'Can be refurbished',
        remanufacturabilityObservation: '',
        remanufacturabilityReference: null,
      },
    };

    renderWithProviders(
      <ProductCircularityProperties product={productWithData} editMode={false} />,
    );

    expect(screen.getByText('1 property hidden.')).toBeOnTheScreen();
  });

  it('renders repairability when only the reference field has content', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        repairabilityComment: null,
        repairabilityObservation: '',
        repairabilityReference: 'ISO 14021:2016',
      },
    };

    renderWithProviders(
      <ProductCircularityProperties product={productWithData} editMode={false} />,
    );

    expect(screen.getByText('1 property hidden.')).toBeOnTheScreen();
  });

  it('calls onChangeCircularityProperties when chip is pressed to add recyclability', async () => {
    const onChange = jest.fn();
    renderWithProviders(
      <ProductCircularityProperties
        product={baseProduct}
        editMode={true}
        onChangeCircularityProperties={onChange}
      />,
    );
    fireEvent.press(screen.getByText('Show'));
    fireEvent.press(screen.getByText('Recyclability', { exact: false }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          recyclabilityComment: '',
          recyclabilityReference: '',
          recyclabilityObservation: '',
        }),
      );
    });
  });

  it('updates the editable fields for an expanded property', async () => {
    const onChange = jest.fn();
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityObservation: 'Existing observation',
        recyclabilityComment: 'Existing comment',
        recyclabilityReference: 'Existing reference',
      },
    };
    const { UNSAFE_root } = renderWithProviders(
      <ProductCircularityProperties
        product={productWithData}
        editMode={true}
        onChangeCircularityProperties={onChange}
      />,
    );
    fireEvent.press(screen.getByText('Show'));

    const expandButton = UNSAFE_root.findAll((node: unknown) => {
      const candidate = node as {
        props: {
          onPress?: unknown;
          children?: { props?: { name?: unknown } };
        };
      };
      return (
        typeof candidate.props.onPress === 'function' &&
        candidate.props.children?.props?.name === 'chevron-down'
      );
    })[0];
    fireEvent.press(expandButton);

    const inputs = await UNSAFE_root.findAllByType(TextInput);
    expect(inputs.length).toBeGreaterThanOrEqual(3);

    fireEvent.changeText(inputs[0], 'Can be recycled');
    fireEvent.changeText(inputs[1], 'Observed in practice');
    fireEvent.changeText(inputs[2], 'ISO 14021');

    await waitFor(() => {
      expect(
        onChange.mock.calls.some((call) => {
          const value = call[0] as Product['circularityProperties'];
          return (
            value.recyclabilityObservation === 'Can be recycled' &&
            value.recyclabilityComment === 'Existing comment' &&
            value.recyclabilityReference === 'Existing reference'
          );
        }),
      ).toBe(true);
      expect(
        onChange.mock.calls.some((call) => {
          const value = call[0] as Product['circularityProperties'];
          return (
            value.recyclabilityObservation === 'Existing observation' &&
            value.recyclabilityComment === 'Observed in practice' &&
            value.recyclabilityReference === 'Existing reference'
          );
        }),
      ).toBe(true);
      expect(
        onChange.mock.calls.some((call) => {
          const value = call[0] as Product['circularityProperties'];
          return (
            value.recyclabilityObservation === 'Existing observation' &&
            value.recyclabilityComment === 'Existing comment' &&
            value.recyclabilityReference === 'ISO 14021'
          );
        }),
      ).toBe(true);
    });
  });

  it('removes an existing property when the delete action is pressed', () => {
    const onChange = jest.fn();
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityObservation: 'Observed',
        recyclabilityComment: 'Comment',
        recyclabilityReference: 'Reference',
      },
    };

    const { UNSAFE_root } = renderWithProviders(
      <ProductCircularityProperties
        product={productWithData}
        editMode={true}
        onChangeCircularityProperties={onChange}
      />,
    );
    fireEvent.press(screen.getByText('Show'));

    const deleteButton = UNSAFE_root.findAll((node: unknown) => {
      const candidate = node as {
        props: {
          onPress?: unknown;
          children?: { props?: { name?: unknown } };
        };
      };
      return (
        typeof candidate.props.onPress === 'function' &&
        candidate.props.children?.props?.name === 'delete'
      );
    })[0];
    fireEvent.press(deleteButton);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        recyclabilityObservation: '',
        recyclabilityComment: null,
        recyclabilityReference: null,
      }),
    );
  });

  it('collapses again when Hide is pressed', () => {
    const productWithData: Product = {
      ...baseProduct,
      circularityProperties: {
        ...emptyCircularity,
        recyclabilityObservation: 'Observed',
        recyclabilityComment: null,
        recyclabilityReference: null,
      },
    };

    renderWithProviders(
      <ProductCircularityProperties product={productWithData} editMode={false} />,
    );
    fireEvent.press(screen.getByText('Show'));
    expect(screen.getByText('Hide')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Hide'));
    expect(screen.getByText('1 property hidden.')).toBeOnTheScreen();
  });
});
