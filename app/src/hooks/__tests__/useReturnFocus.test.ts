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
  it('focuses the trigger once the overlay closes', async () => {
    const { rerender } = await renderHook(
      ({ visible }: { visible: boolean }) => useReturnFocus(visible),
      {
        initialProps: { visible: true },
      },
    );

    expect(setFocus).not.toHaveBeenCalled();

    await rerender({ visible: false });

    expect(setFocus).toHaveBeenCalledWith(42);
  });

  it('does not steal focus while the overlay is opening or open', async () => {
    // Focusing the trigger on open would pull the screen reader out of the
    // overlay it just opened — the opposite of what this is for.
    const { rerender } = await renderHook(
      ({ visible }: { visible: boolean }) => useReturnFocus(visible),
      {
        initialProps: { visible: false },
      },
    );

    await rerender({ visible: true });
    await rerender({ visible: true });

    expect(setFocus).not.toHaveBeenCalled();
  });

  it('stays quiet when the trigger has already unmounted', async () => {
    mockedFindNodeHandle.mockReturnValue(null);
    const { rerender } = await renderHook(
      ({ visible }: { visible: boolean }) => useReturnFocus(visible),
      {
        initialProps: { visible: true },
      },
    );

    await rerender({ visible: false });

    expect(setFocus).not.toHaveBeenCalled();
  });
});
