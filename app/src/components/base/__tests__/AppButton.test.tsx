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

test('tonal variant uses the soft-primary fill and primary text color', () => {
  render(<AppButton variant="tonal">Sign in</AppButton>);
  expect(screen.getByRole('button').props.className).toEqual(
    expect.stringContaining('bg-primary/12'),
  );
  expect(screen.getByText('Sign in').props.className).toEqual(
    expect.stringContaining('text-primary'),
  );
});

const SHADOW_CLASS_PATTERN = /\bshadow-(sm|md|lg|xl)\b/;
const ACCENT_CLASS_PATTERN = /\baccent\b/;

// DESIGN.md "Form language — Flat & Sharp": inline surfaces carry no elevation,
// and controls sit at the 6px control radius (Tailwind's rounded-md === 6px).
test.each(['primary', 'tonal', 'outline', 'ghost', 'destructive'] as const)(
  '%s variant is flat and uses the control radius',
  (variant) => {
    render(<AppButton variant={variant}>Label</AppButton>);
    const className = screen.getByRole('button').props.className;
    expect(className).not.toMatch(SHADOW_CLASS_PATTERN);
    expect(className).toEqual(expect.stringContaining('rounded-md'));
  },
);

// DESIGN.md: "the manila accent is a text colour only — never a button fill or a
// hover/pressed state; interaction states use a subtler shade of the primary."
// `accent` is the brand manila (brand.generated.css: --accent: #8F6212), so no
// button variant or state may reference it — pressed/hover are primary-derived.
test.each(['primary', 'tonal', 'outline', 'ghost', 'destructive'] as const)(
  '%s variant never uses the accent for a fill or state',
  (variant) => {
    render(<AppButton variant={variant}>Label</AppButton>);
    expect(screen.getByRole('button').props.className).not.toMatch(ACCENT_CLASS_PATTERN);
    expect(screen.getByText('Label').props.className).not.toMatch(ACCENT_CLASS_PATTERN);
  },
);

test.each(['outline', 'ghost'] as const)(
  '%s variant uses a primary tint state-layer, not a neutral',
  (variant) => {
    render(<AppButton variant={variant}>Label</AppButton>);
    expect(screen.getByRole('button').props.className).toEqual(
      expect.stringContaining('active:bg-primary/'),
    );
  },
);

test('meets the 44px a11y tap-target floor regardless of caller className', () => {
  render(<AppButton className="mx-4 my-2">Add component</AppButton>);
  expect(screen.getByRole('button').props.className).toEqual(expect.stringContaining('min-h-11'));
});

test('forwards arbitrary accessibility props (accessibilityHint) to the underlying button', () => {
  render(<AppButton accessibilityHint="Saves the current product">Save</AppButton>);
  expect(screen.getByRole('button').props.accessibilityHint).toBe('Saves the current product');
});

test('has web hover, cursor, and focus-visible affordances', () => {
  render(<AppButton>Save</AppButton>);
  const className = screen.getByRole('button').props.className;
  expect(className).toEqual(expect.stringContaining('cursor-pointer'));
  expect(className).toEqual(expect.stringContaining('hover:'));
  expect(className).toEqual(expect.stringContaining('focus-visible:'));
});
