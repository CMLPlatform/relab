import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';
import { AccessibilityInfo, type View } from 'react-native';
import { useReturnFocus } from '@/hooks/useReturnFocus';

const trigger = {} as View;
let sendEvent: jest.SpiedFunction<typeof AccessibilityInfo.sendAccessibilityEvent>;

beforeEach(() => {
  jest.clearAllMocks();
  sendEvent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

function renderReturnFocus(initialVisible: boolean, ref: RefObject<View | null>) {
  return renderHook(({ visible }: { visible: boolean }) => useReturnFocus(visible, ref), {
    initialProps: { visible: initialVisible },
  });
}

describe('useReturnFocus', () => {
  it('focuses the trigger once the overlay closes', async () => {
    const { rerender } = await renderReturnFocus(true, { current: trigger });

    expect(sendEvent).not.toHaveBeenCalled();

    await rerender({ visible: false });

    expect(sendEvent).toHaveBeenCalledWith(trigger, 'focus');
  });

  it('does not steal focus while the overlay is opening or open', async () => {
    // Focusing the trigger on open would pull the screen reader out of the
    // overlay it just opened, the opposite of what this is for.
    const { rerender } = await renderReturnFocus(false, { current: trigger });

    await rerender({ visible: true });
    await rerender({ visible: true });

    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('stays quiet when the trigger has already unmounted', async () => {
    const { rerender } = await renderReturnFocus(true, { current: null });

    await rerender({ visible: false });

    expect(sendEvent).not.toHaveBeenCalled();
  });
});
