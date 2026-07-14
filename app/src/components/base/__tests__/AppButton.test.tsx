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

test('primary variant label uses the primary-foreground text color', () => {
  render(<AppButton variant="primary">Save</AppButton>);
  expect(screen.getByText('Save').props.className).toEqual(
    expect.stringContaining('text-primary-foreground'),
  );
});

test('destructive variant label uses the white text color', () => {
  render(<AppButton variant="destructive">Delete</AppButton>);
  expect(screen.getByText('Delete').props.className).toEqual(expect.stringContaining('text-white'));
});
