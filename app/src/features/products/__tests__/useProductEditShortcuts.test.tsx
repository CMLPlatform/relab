import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';
import { type EffectCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useProductEditShortcuts } from '@/features/products/useProductEditShortcuts';
import { setShortcutsEnabled } from '@/hooks/useShortcutsEnabled';

describe('useProductEditShortcuts', () => {
  const originalPlatform = Platform.OS;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const addEventListener = jest.fn((_: string, handler: (event: KeyboardEvent) => void) => {
    listener = handler;
  });
  const removeEventListener = jest.fn();
  const onEdit = jest.fn();
  const onSave = jest.fn();
  const onExit = jest.fn();

  function press(event: Partial<KeyboardEvent> & { key: string }) {
    const preventDefault = jest.fn();
    listener?.({
      target: { tagName: 'DIV' },
      preventDefault,
      ...event,
    } as unknown as KeyboardEvent);
    return preventDefault;
  }

  function render(overrides: { canSave?: boolean; canEdit?: boolean; editMode?: boolean } = {}) {
    return renderHook(() =>
      useProductEditShortcuts({
        editMode: overrides.editMode ?? true,
        canEdit: overrides.canEdit ?? true,
        canSave: overrides.canSave ?? true,
        onEdit,
        onSave,
        onExit,
      }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listener = undefined;
    setShortcutsEnabled(true);
    // Mirrors useProductsListShortcuts' test: the unit-lane expo-router mock
    // leaves useFocusEffect a no-op, so run the callback via a real effect.
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
      value: { querySelector: () => null },
    });
  });

  describe('view mode', () => {
    it('opens the editor on "e"', async () => {
      await render({ editMode: false });

      press({ key: 'e' });

      expect(onEdit).toHaveBeenCalled();
    });

    it('ignores "e" when the user does not own the product', async () => {
      await render({ editMode: false, canEdit: false });

      press({ key: 'e' });

      expect(onEdit).not.toHaveBeenCalled();
    });

    it('ignores "e" while typing in a field', async () => {
      await render({ editMode: false });

      press({ key: 'e', target: { tagName: 'INPUT' } as unknown as EventTarget });

      expect(onEdit).not.toHaveBeenCalled();
    });

    it('ignores "e" once single-key shortcuts are switched off', async () => {
      setShortcutsEnabled(false);
      await render({ editMode: false });

      press({ key: 'e' });

      expect(onEdit).not.toHaveBeenCalled();
    });

    it('leaves Escape and Cmd+S to the browser outside edit mode', async () => {
      await render({ editMode: false });

      press({ key: 'Escape' });
      press({ key: 's', metaKey: true });

      expect(onExit).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('exits edit mode on Escape', async () => {
    await render();

    await act(() => {
      press({ key: 'Escape' });
    });

    expect(onExit).toHaveBeenCalled();
  });

  it('leaves Escape to a text field the user has typed into', async () => {
    await render();

    await act(() => {
      press({ key: 'Escape', target: { tagName: 'INPUT', value: 'half a name' } as never });
    });

    expect(onExit).not.toHaveBeenCalled();
  });

  it('saves on Cmd/Ctrl+S and stops the browser save dialog', async () => {
    await render();

    let preventDefault = jest.fn();
    await act(() => {
      preventDefault = press({ key: 's', metaKey: true });
    });

    expect(onSave).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it('swallows Cmd+S but does not save an invalid form', async () => {
    await render({ canSave: false });

    let preventDefault = jest.fn();
    await act(() => {
      preventDefault = press({ key: 's', ctrlKey: true });
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it('keeps Escape and Cmd+S bound when single-key shortcuts are off', async () => {
    // Neither is a character key shortcut, so SC 2.1.4 does not reach them.
    setShortcutsEnabled(false);
    await render();

    press({ key: 's', metaKey: true });
    press({ key: 'Escape' });

    expect(onSave).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('does not listen off web', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

    await render();
    await render({ editMode: false });

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
