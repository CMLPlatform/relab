import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BOTTOM_NAV_CLEARANCE } from '@/components/base/useBottomNav';
import { CamerasFab } from '@/components/cameras/screen/Chrome';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

const mockUseBottomNavVisible = jest.fn();

// Real BOTTOM_NAV_CLEARANCE constant stays live (imported above); only the
// hook's own routing/breakpoint/auth reads are stubbed so this suite doesn't
// have to mock expo-router/useBreakpoint/useAuth/useVisibleDestinations too.
jest.mock('@/components/base/useBottomNav', () => ({
  ...jest.requireActual<typeof import('@/components/base/useBottomNav')>(
    '@/components/base/useBottomNav',
  ),
  useBottomNavVisible: () => mockUseBottomNavVisible(),
}));

describe('CamerasFab', () => {
  beforeEach(() => {
    mockUseBottomNavVisible.mockReturnValue(false);
  });

  afterEach(() => {
    restorePlatform();
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(<CamerasFab visible onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Add camera'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', async () => {
    await render(<CamerasFab visible={false} onPress={jest.fn()} />);
    expect(screen.queryByLabelText('Add camera')).toBeNull();
  });

  it('bumps its floating offset by BOTTOM_NAV_CLEARANCE on web when BottomNav is visible', async () => {
    mockPlatform('web');
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = await render(<CamerasFab visible onPress={jest.fn()} />);
    const hiddenBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    await rerender(<CamerasFab visible onPress={jest.fn()} />);
    const visibleBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    expect(visibleBottom - hiddenBottom).toBe(BOTTOM_NAV_CLEARANCE);
  });

  it('does not add clearance on native even when BottomNav is visible (native is already in normal flow)', async () => {
    mockPlatform('ios');
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = await render(<CamerasFab visible onPress={jest.fn()} />);
    const hiddenBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    await rerender(<CamerasFab visible onPress={jest.fn()} />);
    const visibleBottom = StyleSheet.flatten(screen.getByRole('button').props.style).bottom;

    expect(visibleBottom).toBe(hiddenBottom);
  });
});
