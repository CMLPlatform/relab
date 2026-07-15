import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductsFab } from '@/components/product/products-screen/FeedbackControls';

describe('ProductsFab', () => {
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<ProductsFab extended isAuthenticated highlight={false} onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Create new product'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the guest accessibility label when signed out', () => {
    render(<ProductsFab extended isAuthenticated={false} highlight={false} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Sign in to create products')).toBeOnTheScreen();
  });
});
