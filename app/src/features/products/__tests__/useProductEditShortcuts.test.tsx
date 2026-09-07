import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';
import { type EffectCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useProductEditShortcuts } from '@/features/products/useProductEditShortcuts';

describe('useProductEditShortcuts', () => {
  const originalPlatform = Platform.OS;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const addEventListener = jest.fn((_: string, handler: (event: KeyboardEvent) => void) => {
    listener = handler;
  });
  const removeEventListener = jest.fn();
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

  function render(overrides: { canSave?: boolean; editMode?: boolean } = {}) {
    return renderHook(() =>
      useProductEditShortcuts({
        editMode: overrides.editMode ?? true,
        canSave: overrides.canSave ?? true,
        onSave,
        onExit,
      }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listener = undefined;
    // Mirrors useProductSearchShortcut's test: the unit-lane expo-router mock
    // leaves useFocusEffect a no-op, so run the callback via a real effect.
    (useFocusEffect as jest.Mock).mockImplementation((cb: unknown) => {
      useEffect(cb as EffectCallback, [cb]);
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
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

  it('does not listen outside edit mode or off web', async () => {
    await render({ editMode: false });
    expect(addEventListener).not.toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await render();
    expect(addEventListener).not.toHaveBeenCalled();
  });
});
