import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';
import { Platform, type TextInput } from 'react-native';
import { useProductSearchShortcut } from '@/features/products/useProductSearchShortcut';

// A real TextInput needs a host tree to mount; the hook only ever calls
// `.focus()`, so a minimal stand-in is enough and keeps these tests cheap.
function makeSearchRef() {
  return { current: { focus: jest.fn() } } as unknown as RefObject<TextInput> & {
    current: { focus: jest.Mock };
  };
}

describe('useProductSearchShortcut', () => {
  const originalPlatform = Platform.OS;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const addEventListener = jest.fn((_: string, handler: (event: KeyboardEvent) => void) => {
    listener = handler;
  });
  const removeEventListener = jest.fn();

  function press(key: string, target: unknown) {
    listener?.({ key, target, preventDefault: jest.fn() } as unknown as KeyboardEvent);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listener = undefined;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('registers a keydown listener on web', () => {
    const searchRef = makeSearchRef();
    renderHook(() => useProductSearchShortcut(searchRef));

    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not register a listener on native', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const searchRef = makeSearchRef();
    renderHook(() => useProductSearchShortcut(searchRef));

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('focuses the search field on "/"', () => {
    const searchRef = makeSearchRef();
    renderHook(() => useProductSearchShortcut(searchRef));

    act(() => press('/', { tagName: 'DIV' }));

    expect(searchRef.current.focus).toHaveBeenCalled();
  });

  it.each([['INPUT'], ['TEXTAREA']])(
    'leaves "/" alone when already typing inside a %s',
    (tagName) => {
      const searchRef = makeSearchRef();
      renderHook(() => useProductSearchShortcut(searchRef));

      act(() => press('/', { tagName }));

      expect(searchRef.current.focus).not.toHaveBeenCalled();
    },
  );

  it('ignores keys other than "/"', () => {
    const searchRef = makeSearchRef();
    renderHook(() => useProductSearchShortcut(searchRef));

    act(() => press('a', { tagName: 'DIV' }));

    expect(searchRef.current.focus).not.toHaveBeenCalled();
  });

  it('removes the listener on cleanup', () => {
    const searchRef = makeSearchRef();
    const { unmount } = renderHook(() => useProductSearchShortcut(searchRef));

    const handler = addEventListener.mock.calls[0]?.[1];
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });
});
