import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useGalleryKeyboardNavigation } from '@/features/gallery/useGalleryKeyboardNavigation';

describe('useGalleryKeyboardNavigation', () => {
  const originalPlatform = Platform.OS;
  const addEventListener = jest.fn();
  const removeEventListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener,
        removeEventListener,
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => null },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('registers a keyboard listener only on web when enabled', async () => {
    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious: jest.fn(),
        onNext: jest.fn(),
      }),
    );

    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('triggers previous and next handlers on arrow keys', async () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();

    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious,
        onNext,
      }),
    );

    const handler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;

    await act(() => {
      handler({ key: 'ArrowLeft' } as KeyboardEvent);
      handler({ key: 'ArrowRight' } as KeyboardEvent);
    });

    expect(onPrevious).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  it('ignores keys when disabled or at bounds', async () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();

    const disabled = await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: false,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious,
        onNext,
      }),
    );
    expect(addEventListener).not.toHaveBeenCalled();
    await disabled.unmount();

    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 0,
        onPrevious,
        onNext,
      }),
    );

    const handler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    await act(() => {
      handler({ key: 'ArrowLeft' } as KeyboardEvent);
    });
    expect(onPrevious).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 2,
        onPrevious,
        onNext,
      }),
    );
    const lastHandler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    await act(() => {
      lastHandler({ key: 'ArrowRight' } as KeyboardEvent);
    });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('removes the listener on cleanup', async () => {
    const { unmount } = await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious: jest.fn(),
        onNext: jest.fn(),
      }),
    );

    const handler = addEventListener.mock.calls[0]?.[1];
    await unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });

  it('keeps one listener while using the latest callbacks after rerenders', async () => {
    const originalPrevious = jest.fn();
    const originalNext = jest.fn();
    const latestPrevious = jest.fn();
    const latestNext = jest.fn();

    const { rerender } = await renderHook(
      ({
        selectedIndex,
        onPrevious,
        onNext,
      }: {
        selectedIndex: number;
        onPrevious: () => void;
        onNext: () => void;
      }) =>
        useGalleryKeyboardNavigation({
          enabled: true,
          imageCount: 3,
          selectedIndex,
          onPrevious,
          onNext,
        }),
      {
        initialProps: {
          selectedIndex: 1,
          onPrevious: originalPrevious,
          onNext: originalNext,
        },
      },
    );

    const handler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;

    await rerender({
      selectedIndex: 1,
      onPrevious: latestPrevious,
      onNext: latestNext,
    });

    expect(addEventListener).toHaveBeenCalledTimes(1);

    await act(() => {
      handler({ key: 'ArrowLeft' } as KeyboardEvent);
      handler({ key: 'ArrowRight' } as KeyboardEvent);
    });

    expect(originalPrevious).not.toHaveBeenCalled();
    expect(originalNext).not.toHaveBeenCalled();
    expect(latestPrevious).toHaveBeenCalledTimes(1);
    expect(latestNext).toHaveBeenCalledTimes(1);
  });
});

describe('useGalleryKeyboardNavigation guards', () => {
  const originalPlatform = Platform.OS;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const addEventListener = jest.fn((_: string, handler: (event: KeyboardEvent) => void) => {
    listener = handler;
  });
  const removeEventListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    listener = undefined;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => null },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  function press(key: string, target: unknown) {
    listener?.({ key, target } as unknown as KeyboardEvent);
  }

  // Regression: arrow keys typed into a text field also moved the gallery slide.
  it.each([['INPUT'], ['TEXTAREA'], ['SELECT']])(
    'ignores arrow keys typed inside a %s',
    async (tagName) => {
      const onPrevious = jest.fn();
      const onNext = jest.fn();
      await renderHook(() =>
        useGalleryKeyboardNavigation({
          enabled: true,
          imageCount: 3,
          selectedIndex: 1,
          onPrevious,
          onNext,
        }),
      );

      await act(() => press('ArrowRight', { tagName, isContentEditable: false }));
      await act(() => press('ArrowLeft', { tagName, isContentEditable: false }));

      expect(onNext).not.toHaveBeenCalled();
      expect(onPrevious).not.toHaveBeenCalled();
    },
  );

  it('ignores arrow keys inside a contentEditable element', async () => {
    const onNext = jest.fn();
    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 0,
        onPrevious: jest.fn(),
        onNext,
      }),
    );

    await act(() => press('ArrowRight', { tagName: 'DIV', isContentEditable: true }));

    expect(onNext).not.toHaveBeenCalled();
  });

  // An open dialog owns the keyboard, so the gallery behind the scrim stays put.
  it('ignores arrow keys while a dialog is open', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => ({}) },
    });
    const onNext = jest.fn();
    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 0,
        onPrevious: jest.fn(),
        onNext,
      }),
    );

    await act(() => press('ArrowRight', { tagName: 'DIV', isContentEditable: false }));

    expect(onNext).not.toHaveBeenCalled();
  });

  it('still navigates when the key lands outside a text field', async () => {
    const onNext = jest.fn();
    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 0,
        onPrevious: jest.fn(),
        onNext,
      }),
    );

    await act(() => press('ArrowRight', { tagName: 'DIV', isContentEditable: false }));

    expect(onNext).toHaveBeenCalled();
  });

  // Regression: every existing test passed imageCount 3, so the single-image
  // guard could be deleted with the suite still green.
  it('does not bind arrow keys for a single-image gallery', async () => {
    await renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 1,
        selectedIndex: 0,
        onPrevious: jest.fn(),
        onNext: jest.fn(),
      }),
    );

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
