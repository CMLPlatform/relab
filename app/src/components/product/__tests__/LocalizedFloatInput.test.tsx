import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import LocalizedFloatInput from '@/components/product/LocalizedFloatInput';
import { mockPlatform, restorePlatform } from '@/test-utils';

describe('LocalizedFloatInput', () => {
  // An inline outline outranks the global :focus-visible ring (global.css),
  // which left spec fields with no focus indicator at all. The painted ring is
  // asserted in a browser by e2e/accessibility.spec.ts.
  it('sets no inline outline on web, so the focus ring can paint', async () => {
    mockPlatform('web');
    await render(<LocalizedFloatInput value={1} label="Weight" unit="kg" />);
    const style = StyleSheet.flatten(screen.getByLabelText('Weight').props.style);
    restorePlatform();
    expect(style).not.toHaveProperty('outline');
    expect(style).not.toHaveProperty('outlineStyle');
  });

  it('lets a long unit label grow instead of clipping it', async () => {
    await render(<LocalizedFloatInput value={1} label="Volume" unit="cm³" />);
    const style = StyleSheet.flatten(screen.getByText('cm³').props.style);
    expect(style).toMatchObject({ minWidth: 30, flexShrink: 0 });
    expect(style).not.toHaveProperty('width');
  });

  it('renders with placeholder', async () => {
    await render(<LocalizedFloatInput value={undefined} placeholder="Enter value" />);
    expect(screen.getByPlaceholderText('Enter value')).toBeOnTheScreen();
  });

  it('renders current value as text', async () => {
    await render(<LocalizedFloatInput value={3.14} />);
    expect(screen.getByDisplayValue('3.14')).toBeOnTheScreen();
  });

  it('renders with unit text when provided', async () => {
    await render(<LocalizedFloatInput value={undefined} unit="kg" />);
    expect(screen.getByText('kg')).toBeOnTheScreen();
  });

  it('renders label text when provided', async () => {
    await render(<LocalizedFloatInput value={undefined} label="Weight" />);
    expect(screen.getByText('Weight')).toBeOnTheScreen();
  });

  it('derives the input accessibilityLabel from the label prop', async () => {
    await render(<LocalizedFloatInput value={undefined} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toBeOnTheScreen();
  });

  it('calls onChange with undefined on blur when input is empty', async () => {
    const onChange = jest.fn();
    await render(<LocalizedFloatInput value={5} onChange={onChange} />);
    const input = screen.getByDisplayValue('5');
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('calls onChange with parsed number on valid blur', async () => {
    const onChange = jest.fn();
    await render(<LocalizedFloatInput value={undefined} onChange={onChange} />);
    const input = screen.getByPlaceholderText('e.g. 12');
    await fireEvent.changeText(input, '42.5');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenCalledWith(42.5);
  });

  it('reverts to previous value when entered value is below min', async () => {
    const onChange = jest.fn();
    await render(<LocalizedFloatInput value={10} onChange={onChange} min={5} />);
    const input = screen.getByDisplayValue('10');
    // Use fireEvent.changeText for atomic replacement; userEvent.type
    // fires intermediate onChange calls that trigger the revert logic
    await fireEvent.changeText(input, '3');
    await fireEvent(input, 'blur');
    // value 3 < min 5, so onChange is NOT called and text reverts
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores non-numeric characters during text change', async () => {
    await render(<LocalizedFloatInput value={undefined} />);
    const input = screen.getByPlaceholderText('e.g. 12');
    await fireEvent.changeText(input, 'abc');
    // "abc" doesn't match the decimal regex, so text state stays empty
    expect(screen.queryByDisplayValue('abc')).toBeNull();
  });

  it('accepts valid decimal text during typing', async () => {
    await render(<LocalizedFloatInput value={undefined} />);
    const input = screen.getByPlaceholderText('e.g. 12');
    await fireEvent.changeText(input, '12.3');
    expect(screen.getByDisplayValue('12.3')).toBeOnTheScreen();
  });

  it('input is not editable when editable=false', async () => {
    await render(<LocalizedFloatInput value={5} editable={false} />);
    expect(screen.getByDisplayValue('5').props.editable).toBe(false);
  });

  it('renders empty when value is NaN', async () => {
    await render(<LocalizedFloatInput value={NaN} />);
    // NaN is normalized to undefined, so the field shows the placeholder not a value
    expect(screen.getByPlaceholderText('e.g. 12')).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('NaN')).toBeNull();
  });
});
