import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { IconButton } from '@/components/base/IconButton';
import { MIN_TAP_TARGET, radius } from '@/constants';

describe('IconButton', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="x" onPress={onPress} accessibilityLabel="Close" />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress while loading', async () => {
    const onPress = jest.fn();
    await render(
      <IconButton icon="refresh-cw" onPress={onPress} accessibilityLabel="Refresh" loading />,
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks the button busy while loading', async () => {
    // Passed as aria-busy/aria-disabled (the only spelling react-native-web reads);
    // RN folds them back into accessibilityState, which is what this reads.
    await render(
      <IconButton icon="refresh-cw" onPress={jest.fn()} accessibilityLabel="Refresh" loading />,
    );
    expect(screen.getByLabelText('Refresh').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('shows a spinner instead of the icon while loading', async () => {
    await render(
      <IconButton icon="refresh-cw" onPress={jest.fn()} accessibilityLabel="Refresh" loading />,
    );
    expect(screen.queryByTestId('icon-refresh')).toBeNull();
  });

  it('exposes the accessibility label', async () => {
    await render(<IconButton icon="pencil" onPress={jest.fn()} accessibilityLabel="Edit name" />);
    expect(screen.getByLabelText('Edit name')).toBeOnTheScreen();
  });

  it('meets the 44px a11y tap-target floor', async () => {
    await render(<IconButton icon="x" onPress={jest.fn()} accessibilityLabel="Close" />);
    // Resolved through the state callback: the floor lives in the style
    // function, never in a className (mixing the two drops the function).
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minWidth).toBe(MIN_TAP_TARGET);
    expect(style.minHeight).toBe(MIN_TAP_TARGET);
    expect(style.minWidth).toBe(44);
    expect(style.minHeight).toBe(44);
  });

  it('forwards arbitrary accessibility props (accessibilityHint)', async () => {
    await render(
      <IconButton
        icon="pencil"
        onPress={jest.fn()}
        accessibilityLabel="Edit name"
        accessibilityHint="Opens the name editor"
      />,
    );
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Opens the name editor');
  });

  it('uses the control radius, not a bespoke circle', async () => {
    await render(<IconButton icon="x" onPress={jest.fn()} accessibilityLabel="Close" />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.borderRadius).toBe(radius.control);
  });
});
