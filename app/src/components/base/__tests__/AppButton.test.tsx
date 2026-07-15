import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppButton } from '@/components/base/AppButton';

// react-native's own Platform.select (Platform.ios.js) hardcodes 'ios'/'native'
// key checks and ignores Platform.OS, and the vendored ui/button.tsx computes
// its Platform.select({ web: ... }) classes once at module-import time (inside
// cva()) — so a runtime mockPlatform('web') call in a test body is too late to
// affect it. Mock the whole module up front so the web branch is baked in when
// AppButton (and ui/button) are first imported below.
jest.mock('react-native', () => {
  // Mutate in place rather than spreading the module namespace — spreading
  // forces eager evaluation of unrelated lazy native-module getters (e.g.
  // DevMenu) that throw outside the real native runtime.
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  actual.Platform.OS = 'web';
  actual.Platform.select = (spec: Record<string, unknown>) => spec.web;
  return actual;
});

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

test('meets the 44px a11y tap-target floor regardless of caller className', () => {
  render(<AppButton className="mx-4 my-2">Add component</AppButton>);
  expect(screen.getByRole('button').props.className).toEqual(expect.stringContaining('min-h-11'));
});

test('has web hover, cursor, and focus-visible affordances', () => {
  render(<AppButton>Save</AppButton>);
  const className = screen.getByRole('button').props.className;
  expect(className).toEqual(expect.stringContaining('cursor-pointer'));
  expect(className).toEqual(expect.stringContaining('hover:'));
  expect(className).toEqual(expect.stringContaining('focus-visible:'));
});
