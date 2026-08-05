import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductNameHeader } from '@/components/product/ProductNameHeader';
import { getAppTheme } from '@/theme';

const theme = getAppTheme('light');
const initialName = 'Initial product name';

describe('ProductNameHeader', () => {
  it('renders the product name as the input value', () => {
    render(<ProductNameHeader name={initialName} editMode={true} theme={theme} />);

    expect(screen.getByDisplayValue('Initial product name')).toBeOnTheScreen();
  });

  it('updates to a new product name before the user starts typing', () => {
    const { rerender } = render(
      <ProductNameHeader name={initialName} editMode={true} theme={theme} />,
    );

    rerender(<ProductNameHeader name="Hydrated product name" editMode={true} theme={theme} />);

    expect(screen.getByDisplayValue('Hydrated product name')).toBeOnTheScreen();
  });

  it('preserves an in-progress draft when props change mid-edit', () => {
    const { rerender } = render(
      <ProductNameHeader name={initialName} editMode={true} theme={theme} />,
    );
    const input = screen.getByDisplayValue('Initial product name');

    fireEvent.changeText(input, 'Unsaved draft');
    rerender(<ProductNameHeader name="Hydrated product name" editMode={true} theme={theme} />);

    expect(screen.getByDisplayValue('Unsaved draft')).toBeOnTheScreen();
  });

  it('calls onProductNameChange with the trimmed draft on blur', () => {
    const onProductNameChange = jest.fn();

    render(
      <ProductNameHeader
        name={initialName}
        editMode={true}
        theme={theme}
        onProductNameChange={onProductNameChange}
      />,
    );

    const input = screen.getByDisplayValue('Initial product name');
    fireEvent.changeText(input, '  Updated product name  ');
    fireEvent(input, 'blur');

    expect(onProductNameChange).toHaveBeenCalledWith('Updated product name');
  });

  it('does not render in view mode', () => {
    render(<ProductNameHeader name={initialName} editMode={false} theme={theme} />);

    expect(screen.queryByDisplayValue('Initial product name')).not.toBeOnTheScreen();
  });
});

describe('ProductNameHeader validation', () => {
  // The invalid state used to be an error-coloured background and nothing else,
  // which reaches neither a screen reader nor a user who can't tell the two
  // backgrounds apart (WCAG 1.4.1, 3.3.1).
  it('names the problem in text and links it to the input', () => {
    render(<ProductNameHeader name="" editMode={true} theme={theme} />);

    const input = screen.getByLabelText('Product name');
    const message = screen.getByRole('alert');

    expect(input.props.accessibilityDescribedBy).toBe(message.props.nativeID);
    expect(message).toBeOnTheScreen();
  });

  it('says nothing while the name is valid', () => {
    render(<ProductNameHeader name={initialName} editMode={true} theme={theme} />);

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Product name').props.accessibilityDescribedBy).toBeUndefined();
  });
});
