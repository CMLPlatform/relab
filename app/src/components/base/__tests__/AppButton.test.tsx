import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppButton } from '@/components/base/AppButton';

test('fires onPress', () => {
  const onPress = jest.fn();
  render(<AppButton onPress={onPress}>Save</AppButton>);
  fireEvent.press(screen.getByText('Save'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('loading disables the button and blocks presses', () => {
  const onPress = jest.fn();
  render(
    <AppButton onPress={onPress} loading>
      Save
    </AppButton>,
  );
  fireEvent.press(screen.getByText('Save'));
  expect(onPress).not.toHaveBeenCalled();
});
