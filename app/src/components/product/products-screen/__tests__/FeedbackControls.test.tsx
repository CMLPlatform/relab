import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BOTTOM_NAV_CLEARANCE } from '@/components/base/useBottomNav';
import { ProductsFab } from '@/components/product/products-screen/FeedbackControls';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

const mockUseBottomNavVisible = jest.fn();
const CREATION_LABEL_CASES: Array<
  [
    'guest' | 'unverified' | 'verified',
    'Sign in to add product' | 'Verify email to add product' | 'New product',
  ]
> = [
  ['guest', 'Sign in to add product'],
  ['unverified', 'Verify email to add product'],
  ['verified', 'New product'],
];

// Real BOTTOM_NAV_CLEARANCE constant stays live (imported above); only the
// hook's own routing/breakpoint/auth reads are stubbed so this suite doesn't
// have to mock expo-router/useBreakpoint/useAuth/useVisibleDestinations too.
jest.mock('@/components/base/useBottomNav', () => ({
  ...jest.requireActual<typeof import('@/components/base/useBottomNav')>(
    '@/components/base/useBottomNav',
  ),
  useBottomNavVisible: () => mockUseBottomNavVisible(),
}));

describe('ProductsFab', () => {
  beforeEach(() => {
    mockUseBottomNavVisible.mockReturnValue(false);
  });

  afterEach(() => {
    restorePlatform();
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<ProductsFab extended creationState="verified" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('New product'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Guests get the fab at full strength: it is enabled for them, and
  // `createProductAction` explains the sign-in gate on press. Dimming it would
  // read as disabled, and the label must not drift from the visible one.
  it('never dims, so it does not read as disabled', () => {
    render(<ProductsFab extended creationState="guest" onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.opacity ?? 1).toBe(1);
  });

  // WCAG 2.5.3: the accessible name must contain the visible label.
  it('matches its accessible name to the visible label', () => {
    render(<ProductsFab extended creationState="guest" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Sign in to add product')).toBeOnTheScreen();
    expect(screen.getByText('Sign in to add product')).toBeOnTheScreen();
  });

  it.each(CREATION_LABEL_CASES)(
    'uses the truthful label for %s creation state',
    (creationState, label) => {
      render(<ProductsFab extended creationState={creationState} onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
      expect(screen.getByText(label)).toBeOnTheScreen();
    },
  );

  it.each(['guest', 'unverified'] as const)(
    'keeps the truthful %s label visible when the scroll state requests a collapsed FAB',
    (creationState) => {
      render(<ProductsFab extended={false} creationState={creationState} onPress={jest.fn()} />);
      expect(
        screen.getByText(
          CREATION_LABEL_CASES.find(([state]) => state === creationState)?.[1] ?? '',
        ),
      ).toBeOnTheScreen();
    },
  );

  it('allows the verified-user FAB to collapse on scroll', () => {
    render(<ProductsFab extended={false} creationState="verified" onPress={jest.fn()} />);
    expect(screen.queryByText('New product')).toBeNull();
  });

  it('bumps its floating offset by BOTTOM_NAV_CLEARANCE on web when BottomNav is visible', () => {
    mockPlatform('web');
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = render(
      <ProductsFab extended creationState="verified" onPress={jest.fn()} />,
    );
    const hiddenBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ProductsFab extended creationState="verified" onPress={jest.fn()} />);
    const visibleBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    expect(visibleBottom - hiddenBottom).toBe(BOTTOM_NAV_CLEARANCE);
  });

  it('does not add clearance on native even when BottomNav is visible (native is already in normal flow)', () => {
    mockPlatform('ios');
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = render(
      <ProductsFab extended creationState="verified" onPress={jest.fn()} />,
    );
    const hiddenBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ProductsFab extended creationState="verified" onPress={jest.fn()} />);
    const visibleBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    expect(visibleBottom).toBe(hiddenBottom);
  });
});
