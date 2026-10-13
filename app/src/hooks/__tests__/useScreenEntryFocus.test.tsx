import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useScreenEntryFocus } from '@/hooks/useScreenEntryFocus';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

type FakeElement = {
  tabIndex?: number;
  style: { outline?: string };
  focus: jest.Mock;
  querySelector?: jest.Mock;
};

const fakeElement = (heading?: FakeElement): FakeElement => ({
  style: {},
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
    // The scaffold is the whole page column: a UA focus ring around it reads
    // as a stray selection box.
    expect(root.style.outline).toBe('none');
  });

  // A heading that arrives with async data (the public profile) would lose to
  // the scaffold if focus moved on the first frame.
  it('waits until the screen is ready before moving focus', async () => {
    mockPlatform('web');
    const heading = fakeElement();
    const root = fakeElement(heading);
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) => useScreenEntryFocus(ready),
      { initialProps: { ready: false } },
    );
    (result.current as unknown as { current: FakeElement }).current = root;
    await act(async () => {
      jest.advanceTimersByTime(32);
    });
    expect(root.focus).not.toHaveBeenCalled();
    expect(heading.focus).not.toHaveBeenCalled();

    await rerender({ ready: true });
    await act(async () => {
      jest.advanceTimersByTime(32);
    });
    expect(heading.focus).toHaveBeenCalled();
  });

  // A screen that fades in is hidden for its first frames, and focus() on a
  // hidden element is ignored. The hook retries until focus lands, and stops
  // as soon as it does.
  describe('when the first focus does not take', () => {
    const globals = globalThis as { document?: unknown };
    const hadDocument = 'document' in globals;
    const originalDocument = globals.document;
    const body = {};
    const fakeDocument: { body: object; activeElement: unknown } = { body, activeElement: body };

    beforeEach(() => {
      fakeDocument.activeElement = body;
      globals.document = fakeDocument;
    });

    afterEach(() => {
      if (hadDocument) globals.document = originalDocument;
      else Reflect.deleteProperty(globals, 'document');
    });

    it('retries on later frames until the heading holds focus', async () => {
      mockPlatform('web');
      const heading = fakeElement();
      heading.focus.mockImplementationOnce(() => {}); // hidden: ignored
      heading.focus.mockImplementation(() => {
        fakeDocument.activeElement = heading;
      });
      const root = fakeElement(heading);

      await runEntryFocus(root);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(heading.focus).toHaveBeenCalledTimes(2);
    });

    it('leaves focus alone once the user has moved it elsewhere', async () => {
      mockPlatform('web');
      const heading = fakeElement();
      heading.focus.mockImplementation(() => {
        fakeDocument.activeElement = { other: true };
      });
      const root = fakeElement(heading);

      await runEntryFocus(root);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(heading.focus).toHaveBeenCalledTimes(1);
    });
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
