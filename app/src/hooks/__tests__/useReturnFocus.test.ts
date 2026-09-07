import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, findNodeHandle } from 'react-native';
import { useReturnFocus } from '@/hooks/useReturnFocus';

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  findNodeHandle: jest.fn(() => 42),
}));

const mockedFindNodeHandle = jest.mocked(findNodeHandle);
let setFocus: jest.SpiedFunction<typeof AccessibilityInfo.setAccessibilityFocus>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedFindNodeHandle.mockReturnValue(42);
  setFocus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
});

describe('useReturnFocus', () => {
  it('focuses the trigger once the overlay closes', () => {
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useReturnFocus(visible),
      {
        initialProps: { visible: true },
      },
    );

    expect(setFocus).not.toHaveBeenCalled();

    rerender({ visible: false });

    expect(setFocus).toHaveBeenCalledWith(42);
  });

  it('does not steal focus while the overlay is opening or open', () => {
    // Focusing the trigger on open would pull the screen reader out of the
    // overlay it just opened — the opposite of what this is for.
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useReturnFocus(visible),
      {
        initialProps: { visible: false },
      },
    );

    rerender({ visible: true });
    rerender({ visible: true });

    expect(setFocus).not.toHaveBeenCalled();
  });

  it('stays quiet when the trigger has already unmounted', () => {
    mockedFindNodeHandle.mockReturnValue(null);
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useReturnFocus(visible),
      {
        initialProps: { visible: true },
      },
    );

    rerender({ visible: false });

    expect(setFocus).not.toHaveBeenCalled();
  });
});
