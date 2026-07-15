import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Fab } from '@/components/base/Fab';

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
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
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
