import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useGalleryKeyboardNavigation } from '@/hooks/gallery/useGalleryKeyboardNavigation';

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
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('registers a keyboard listener only on web when enabled', () => {
    renderHook(() =>
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

  it('triggers previous and next handlers on arrow keys', () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();

    renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious,
        onNext,
      }),
    );

    const handler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;

    act(() => {
      handler({ key: 'ArrowLeft' } as KeyboardEvent);
      handler({ key: 'ArrowRight' } as KeyboardEvent);
    });

    expect(onPrevious).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  it('ignores keys when disabled or at bounds', () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();

    const disabled = renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: false,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious,
        onNext,
      }),
    );
    expect(addEventListener).not.toHaveBeenCalled();
    disabled.unmount();

    renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 0,
        onPrevious,
        onNext,
      }),
    );

    const handler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    act(() => {
      handler({ key: 'ArrowLeft' } as KeyboardEvent);
    });
    expect(onPrevious).not.toHaveBeenCalled();

    jest.clearAllMocks();
    renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 2,
        onPrevious,
        onNext,
      }),
    );
    const lastHandler = addEventListener.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    act(() => {
      lastHandler({ key: 'ArrowRight' } as KeyboardEvent);
    });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('removes the listener on cleanup', () => {
    const { unmount } = renderHook(() =>
      useGalleryKeyboardNavigation({
        enabled: true,
        imageCount: 3,
        selectedIndex: 1,
        onPrevious: jest.fn(),
        onNext: jest.fn(),
      }),
    );

    const handler = addEventListener.mock.calls[0]?.[1];
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });
});
