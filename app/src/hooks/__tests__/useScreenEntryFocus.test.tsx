import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useScreenEntryFocus } from '@/hooks/useScreenEntryFocus';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

type FakeElement = { tabIndex?: number; focus: jest.Mock; querySelector?: jest.Mock };

const fakeElement = (heading?: FakeElement): FakeElement => ({
  focus: jest.fn(),
  querySelector: jest.fn(() => heading ?? null),
});

/** Mount, attach `root` to the returned ref, then let the queued frame run. */
async function runEntryFocus(root: FakeElement | null) {
  const { result } = await renderHook(() => useScreenEntryFocus());
  (result.current as unknown as { current: FakeElement | null }).current = root;
  await act(async () => {
    jest.advanceTimersByTime(32);
  });
  return result;
}

describe('useScreenEntryFocus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    restorePlatform();
  });

  // Without this the browser leaves focus on <body> after a route change, so
  // screen-reader and keyboard users restart from the top of the document.
  it('moves focus to the screen heading on entry', async () => {
    mockPlatform('web');
    const heading = fakeElement();
    const root = fakeElement(heading);

    await runEntryFocus(root);

    expect(root.querySelector).toHaveBeenCalledWith('h1');
    expect(heading.focus).toHaveBeenCalled();
    // Programmatic focus needs a tab index, but the heading must stay out of
    // the tab order afterwards.
    expect(heading.tabIndex).toBe(-1);
    expect(root.focus).not.toHaveBeenCalled();
  });

  it('falls back to the scaffold when the screen has no h1', async () => {
    mockPlatform('web');
    const root = fakeElement();

    await runEntryFocus(root);

    expect(root.focus).toHaveBeenCalled();
    expect(root.tabIndex).toBe(-1);
  });

  it('does nothing when the ref was never attached', async () => {
    mockPlatform('web');

    await expect(runEntryFocus(null)).resolves.toBeDefined();
  });

  // Native has no DOM focus ring to move; the hook must not touch the ref.
  it('is a no-op on native', async () => {
    mockPlatform('ios');
    const root = fakeElement(fakeElement());

    await runEntryFocus(root);

    expect(root.querySelector).not.toHaveBeenCalled();
    expect(root.focus).not.toHaveBeenCalled();
  });
});
