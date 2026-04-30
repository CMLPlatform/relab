import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductNameHeader } from '@/hooks/products/ProductNameHeader';
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
