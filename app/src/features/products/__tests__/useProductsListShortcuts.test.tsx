import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';
import { type EffectCallback, type RefObject, useEffect } from 'react';
import { Platform, type TextInput } from 'react-native';
import { useProductsListShortcuts } from '@/features/products/useProductsListShortcuts';

// A real TextInput needs a host tree to mount; the hook only ever calls
// `.focus()`, so a minimal stand-in is enough and keeps these tests cheap.
function makeSearchRef() {
  return { current: { focus: jest.fn() } } as unknown as RefObject<TextInput> & {
    current: { focus: jest.Mock };
  };
}

describe('useProductsListShortcuts', () => {
  const originalPlatform = Platform.OS;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const addEventListener = jest.fn((_: string, handler: (event: KeyboardEvent) => void) => {
    listener = handler;
  });
  const removeEventListener = jest.fn();
  const querySelector = jest.fn<(selectors: string) => Element | null>(() => null);

  function press(key: string, target: unknown, modifiers: Record<string, boolean> = {}) {
    listener?.({
      key,
      target,
      preventDefault: jest.fn(),
      ...modifiers,
    } as unknown as KeyboardEvent);
  }

  async function renderShortcuts() {
    const searchRef = makeSearchRef();
    const onNewProduct = jest.fn();
    const onToggleFilters = jest.fn();
    const rendered = await renderHook(() =>
      useProductsListShortcuts({ searchRef, onNewProduct, onToggleFilters }),
    );
    return { searchRef, onNewProduct, onToggleFilters, ...rendered };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listener = undefined;
    querySelector.mockReturnValue(null);
    // The unit-lane expo-router mock leaves useFocusEffect a no-op; run the
    // callback via a real effect so these tests exercise the products-screen-
    // focused path and its cleanup runs on unmount like the real hook.
    (useFocusEffect as jest.Mock).mockImplementation((cb: unknown) => {
      useEffect(cb as EffectCallback, [cb]);
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('registers a keydown listener on web', async () => {
    const { searchRef } = await renderShortcuts();

    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not register a listener on native', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await renderShortcuts();

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('focuses the search field on "/"', async () => {
    const { searchRef } = await renderShortcuts();

    await act(() => press('/', { tagName: 'DIV' }));

    expect(searchRef.current.focus).toHaveBeenCalled();
  });

  it('leaves "/" alone while a modal dialog is open', async () => {
    querySelector.mockReturnValue({} as Element);
    const { searchRef } = await renderShortcuts();

    await act(() => press('/', { tagName: 'DIV' }));

    expect(querySelector).toHaveBeenCalledWith('[aria-modal="true"]');
    expect(searchRef.current.focus).not.toHaveBeenCalled();
  });

  it.each([['INPUT'], ['TEXTAREA']])(
    'leaves "/" alone when already typing inside a %s',
    async (tagName) => {
      const { searchRef } = await renderShortcuts();

      await act(() => press('/', { tagName }));

      expect(searchRef.current.focus).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a contenteditable host', { tagName: 'DIV', isContentEditable: true }],
    ['an ARIA textbox', { tagName: 'DIV', getAttribute: () => 'textbox' }],
  ])('leaves "/" alone when already typing inside %s', async (_label, target) => {
    const { searchRef } = await renderShortcuts();

    await act(() => press('/', target));

    expect(searchRef.current.focus).not.toHaveBeenCalled();
  });

  it('ignores keys other than "/"', async () => {
    const { searchRef } = await renderShortcuts();

    await act(() => press('a', { tagName: 'DIV' }));

    expect(searchRef.current.focus).not.toHaveBeenCalled();
  });

  it('starts a new product on "n"', async () => {
    const { onNewProduct } = await renderShortcuts();

    await act(() => press('n', { tagName: 'DIV' }));

    expect(onNewProduct).toHaveBeenCalled();
  });

  it('toggles the filter row on "f"', async () => {
    const { onToggleFilters } = await renderShortcuts();

    await act(() => press('f', { tagName: 'DIV' }));

    expect(onToggleFilters).toHaveBeenCalled();
  });

  it.each([['metaKey'], ['ctrlKey'], ['altKey']])(
    "leaves the browser's own %s binding alone",
    async (modifier) => {
      const { onNewProduct } = await renderShortcuts();

      await act(() => press('n', { tagName: 'DIV' }, { [modifier]: true }));

      expect(onNewProduct).not.toHaveBeenCalled();
    },
  );

  it('removes the listener on cleanup', async () => {
    const { unmount } = await renderShortcuts();

    const handler = addEventListener.mock.calls[0]?.[1];
    await unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });
});
