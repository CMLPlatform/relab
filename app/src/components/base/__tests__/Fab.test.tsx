import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Fab } from '@/components/base/Fab';
import { getAppTheme } from '@/theme';

describe('Fab', () => {
  it('renders the label when extended', () => {
    render(
      <Fab icon="plus" label="New product" extended onPress={jest.fn()} accessibilityLabel="a" />,
    );
    expect(screen.getByText('New product')).toBeOnTheScreen();
  });

  it('omits the label when collapsed', () => {
    render(
      <Fab
        icon="plus"
        label="New product"
        extended={false}
        onPress={jest.fn()}
        accessibilityLabel="a"
      />,
    );
    expect(screen.queryByText('New product')).toBeNull();
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<Fab icon="plus" label="New" extended onPress={onPress} accessibilityLabel="a" />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress when disabled', () => {
    const onPress = jest.fn();
    render(
      <Fab icon="plus" label="New" extended onPress={onPress} disabled accessibilityLabel="a" />,
    );
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders nothing when not visible', () => {
    render(
      <Fab
        icon="plus"
        label="New"
        extended
        onPress={jest.fn()}
        visible={false}
        accessibilityLabel="a"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('meets the 44px a11y tap-target floor', () => {
    render(<Fab icon="plus" label="New" extended onPress={jest.fn()} accessibilityLabel="a" />);
    const className = screen.getByRole('button').props.className as string;
    expect(className).toContain('min-w-11');
    expect(className).toContain('min-h-11');
  });

  // DESIGN.md "Form language — Flat & Sharp": the FAB is a floating surface, so
  // it takes the overlay radius (not the `full` pill radius, which is reserved
  // for avatars/true pills) plus the single shared overlay elevation tier.
  it('uses the overlay radius and the shared elevation tier', () => {
    render(<Fab icon="plus" label="New" extended onPress={jest.fn()} accessibilityLabel="a" />);
    const button = screen.getByRole('button');
    // radius.overlay (12px) maps to Tailwind's rounded-xl step.
    expect(button.props.className as string).toContain('rounded-xl');
    const style = StyleSheet.flatten(button.props.style);
    const overlay = getAppTheme('light').tokens.elevation.overlay;
    expect(style.shadowRadius).toBe(overlay.shadowRadius);
    expect(style.shadowOpacity).toBe(overlay.shadowOpacity);
    expect(style.elevation).toBe(overlay.elevation);
  });

  it('forwards arbitrary accessibility props (accessibilityHint)', () => {
    render(
      <Fab
        icon="plus"
        label="New"
        extended
        onPress={jest.fn()}
        accessibilityLabel="a"
        accessibilityHint="Creates a new product"
      />,
    );
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Creates a new product');
  });

  it('exposes the accessibility label', () => {
    render(
      <Fab
        icon="plus"
        label="New"
        extended
        onPress={jest.fn()}
        accessibilityLabel="Create new product"
      />,
    );
    expect(screen.getByLabelText('Create new product')).toBeOnTheScreen();
  });
});
