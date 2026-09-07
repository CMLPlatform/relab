import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import type { ReactNode } from 'react';
import { useScreenFocusedSafe } from '@/hooks/useScreenFocused';

type Listener = () => void;

function fakeNavigation(initiallyFocused: boolean) {
  const listeners: Record<string, Listener[]> = { focus: [], blur: [] };
  const unsubscribe = jest.fn();
  return {
    isFocused: () => initiallyFocused,
    addListener: jest.fn((event: string, cb: Listener) => {
      listeners[event].push(cb);
      return unsubscribe;
    }),
    emit: (event: 'focus' | 'blur') => {
      for (const cb of listeners[event]) cb();
    },
    unsubscribe,
  };
}

function renderInNavigator(navigation: ReturnType<typeof fakeNavigation>) {
  return renderHook(() => useScreenFocusedSafe(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NavigationContext.Provider value={navigation as never}>
        {children}
      </NavigationContext.Provider>
    ),
  });
}

describe('useScreenFocusedSafe', () => {
  // The point of the hook: components using it also render in tests, storybook
  // and modals that sit outside a navigator, where useIsFocused would throw.
  it('reports focused outside a navigator instead of throwing', async () => {
    const { result } = await renderHook(() => useScreenFocusedSafe());

    expect(result.current).toBe(true);
  });

  it('seeds from the navigator’s current focus rather than assuming focused', async () => {
    expect((await renderInNavigator(fakeNavigation(false))).result.current).toBe(false);
    expect((await renderInNavigator(fakeNavigation(true))).result.current).toBe(true);
  });

  it('follows blur and focus events from the navigator', async () => {
    const navigation = fakeNavigation(true);
    const { result } = await renderInNavigator(navigation);

    await act(() => navigation.emit('blur'));
    expect(result.current).toBe(false);

    await act(() => navigation.emit('focus'));
    expect(result.current).toBe(true);
  });

  // Screens mount and unmount constantly; a leaked listener would keep setting
  // state on an unmounted tree for the life of the navigator.
  it('unsubscribes both listeners on unmount', async () => {
    const navigation = fakeNavigation(true);
    const { unmount } = await renderInNavigator(navigation);
    expect(navigation.addListener).toHaveBeenCalledTimes(2);

    await unmount();
    expect(navigation.unsubscribe).toHaveBeenCalledTimes(2);
  });
});
