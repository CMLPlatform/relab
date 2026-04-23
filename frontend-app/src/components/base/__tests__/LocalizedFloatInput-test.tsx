import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import LocalizedFloatInput from '../LocalizedFloatInput';

describe('LocalizedFloatInput', () => {
  it('renders with placeholder', () => {
    render(<LocalizedFloatInput value={undefined} placeholder="Enter value" />);
    expect(screen.getByPlaceholderText('Enter value')).toBeOnTheScreen();
  });

  it('renders current value as text', () => {
    render(<LocalizedFloatInput value={3.14} />);
    expect(screen.getByDisplayValue('3.14')).toBeOnTheScreen();
  });

  it('renders with unit text when provided', () => {
    render(<LocalizedFloatInput value={undefined} unit="kg" />);
    expect(screen.getByText('kg')).toBeOnTheScreen();
  });

  it('renders label text when provided', () => {
    render(<LocalizedFloatInput value={undefined} label="Weight" />);
    expect(screen.getByText('Weight')).toBeOnTheScreen();
  });

  it('calls onChange with undefined on blur when input is empty', async () => {
    const onChange = jest.fn();
    render(<LocalizedFloatInput value={5} onChange={onChange} />);
    const input = screen.getByDisplayValue('5');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('calls onChange with parsed number on valid blur', async () => {
    const onChange = jest.fn();
    render(<LocalizedFloatInput value={undefined} onChange={onChange} />);
    const input = screen.getByPlaceholderText('> 0');
    fireEvent.changeText(input, '42.5');
    fireEvent(input, 'blur');
    expect(onChange).toHaveBeenCalledWith(42.5);
  });

  it('reverts to previous value when entered value is below min', () => {
    const onChange = jest.fn();
    render(<LocalizedFloatInput value={10} onChange={onChange} min={5} />);
    const input = screen.getByDisplayValue('10');
    // Use fireEvent.changeText for atomic replacement — userEvent.type
    // fires intermediate onChange calls that trigger the revert logic
    fireEvent.changeText(input, '3');
    fireEvent(input, 'blur');
    // value 3 < min 5, so onChange is NOT called and text reverts
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores non-numeric characters during text change', async () => {
    render(<LocalizedFloatInput value={undefined} />);
    const input = screen.getByPlaceholderText('> 0');
    fireEvent.changeText(input, 'abc');
    // "abc" doesn't match the decimal regex, so text state stays empty
    expect(screen.queryByDisplayValue('abc')).toBeNull();
  });

  it('accepts valid decimal text during typing', async () => {
    render(<LocalizedFloatInput value={undefined} />);
    const input = screen.getByPlaceholderText('> 0');
    fireEvent.changeText(input, '12.3');
    expect(screen.getByDisplayValue('12.3')).toBeOnTheScreen();
  });

  it('input is not editable when editable=false', () => {
    render(<LocalizedFloatInput value={5} editable={false} />);
    expect(screen.getByDisplayValue('5').props.editable).toBe(false);
  });

  it('renders empty when value is NaN', () => {
    render(<LocalizedFloatInput value={NaN} />);
    // NaN is normalized to undefined, so the field shows the placeholder not a value
    expect(screen.getByPlaceholderText('> 0')).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('NaN')).toBeNull();
  });
});
