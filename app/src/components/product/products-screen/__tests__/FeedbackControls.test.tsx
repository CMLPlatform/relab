import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ProductsFab } from '@/components/product/products-screen/FeedbackControls';

describe('ProductsFab', () => {
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<ProductsFab extended highlight={false} onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('New product'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Guests get the fab at full strength: it is enabled for them, and
  // `createProductAction` explains the sign-in gate on press. Dimming it would
  // read as disabled, and the label must not drift from the visible one.
  it('never dims, so it does not read as disabled', () => {
    render(<ProductsFab extended highlight={false} onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.opacity ?? 1).toBe(1);
  });

  // WCAG 2.5.3: the accessible name must contain the visible label.
  it('matches its accessible name to the visible label', () => {
    render(<ProductsFab extended highlight={false} onPress={jest.fn()} />);
    expect(screen.getByLabelText('New product')).toBeOnTheScreen();
    expect(screen.getByText('New product')).toBeOnTheScreen();
  });
});
