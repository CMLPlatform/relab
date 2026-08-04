import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { IconButton } from '@/components/base/IconButton';
import { radius } from '@/constants';

describe('IconButton', () => {
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<IconButton icon="close" onPress={onPress} accessibilityLabel="Close" />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress while loading', () => {
    const onPress = jest.fn();
    render(<IconButton icon="refresh" onPress={onPress} accessibilityLabel="Refresh" loading />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the icon while loading', () => {
    render(<IconButton icon="refresh" onPress={jest.fn()} accessibilityLabel="Refresh" loading />);
    expect(screen.queryByTestId('icon-refresh')).toBeNull();
  });

  it('exposes the accessibility label', () => {
    render(<IconButton icon="pencil" onPress={jest.fn()} accessibilityLabel="Edit name" />);
    expect(screen.getByLabelText('Edit name')).toBeOnTheScreen();
  });

  it('meets the 44px a11y tap-target floor', () => {
    render(<IconButton icon="close" onPress={jest.fn()} accessibilityLabel="Close" />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('forwards arbitrary accessibility props (accessibilityHint)', () => {
    render(
      <IconButton
        icon="pencil"
        onPress={jest.fn()}
        accessibilityLabel="Edit name"
        accessibilityHint="Opens the name editor"
      />,
    );
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Opens the name editor');
  });

  it('uses the control radius, not a bespoke circle', () => {
    render(<IconButton icon="close" onPress={jest.fn()} accessibilityLabel="Close" />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.borderRadius).toBe(radius.control);
  });
});
