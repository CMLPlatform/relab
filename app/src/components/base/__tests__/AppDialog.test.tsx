import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { AppDialog } from '@/components/base/AppDialog';
import {
  getHostByType,
  mockPlatform,
  queryAllHostsByProps,
  renderWithProviders,
  restorePlatform,
} from '@/test-utils/index';

// The library mock renders KeyboardAvoidingView as a bare View; mark it so the test can find it.
jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return {
    KeyboardAvoidingView: (props: object) => <View testID="kav" {...props} />,
  };
});

// The web branch of useReturnFocus reads document.activeElement; the RN test
// environment has no DOM, so stub the one property it touches.
function stubDocument(activeElement: unknown) {
  Object.defineProperty(globalThis, 'document', {
    value: { activeElement },
    configurable: true,
  });
}

afterEach(() => {
  restorePlatform();
  Reflect.deleteProperty(globalThis, 'document');
});

describe('AppDialog', () => {
  it('fades in over 200ms and out over 150ms, staying mounted until the fade lands', async () => {
    // The shared setup mocks Reanimated; hold back withTiming's completion callbacks.
    const calls: Array<{ to: number; duration?: number; reduceMotion?: string }> = [];
    const pending: Array<(finished: boolean) => void> = [];
    const timing = jest
      .spyOn(
        jest.requireMock<{ withTiming: () => unknown }>('react-native-reanimated'),
        'withTiming',
      )
      .mockImplementation(((
        to: number,
        config: { duration?: number; reduceMotion?: string },
        callback?: (finished: boolean) => void,
      ) => {
        calls.push({ to, duration: config.duration, reduceMotion: config.reduceMotion });
        if (callback) pending.push(callback);
        return to;
      }) as never);
    const dialog = (visible: boolean) => (
      <AppDialog visible={visible} onDismiss={jest.fn()} accessibilityLabel="Motion">
        <Text>Body</Text>
      </AppDialog>
    );

    try {
      await renderWithProviders(dialog(true));
      // The Modal's own fade is off; the content runs its own.
      expect(queryAllHostsByProps({ animationType: 'none' })).toHaveLength(1);
      expect(calls).toEqual([{ to: 1, duration: 200, reduceMotion: 'system' }]);

      await screen.rerender(dialog(false));
      expect(calls.at(-1)).toEqual({ to: 0, duration: 150, reduceMotion: 'system' });
      expect(screen.getByText('Body')).toBeOnTheScreen();

      await act(async () => {
        for (const done of pending) done(true);
      });
      expect(screen.queryByText('Body')).toBeNull();
    } finally {
      timing.mockRestore();
    }
  });

  it('takes no Escape and no keys while it fades out', async () => {
    // Hold the exit open: withTiming never reports finished, so the body stays mounted.
    const timing = jest
      .spyOn(
        jest.requireMock<{ withTiming: () => unknown }>('react-native-reanimated'),
        'withTiming',
      )
      .mockImplementation(((to: number) => to) as never);
    const onDismiss = jest.fn();
    const dialog = (visible: boolean) => (
      <AppDialog visible={visible} onDismiss={onDismiss} accessibilityLabel="Closing">
        <Text>Body</Text>
      </AppDialog>
    );
    try {
      await renderWithProviders(dialog(true));
      await screen.rerender(dialog(false));
      expect(screen.getByText('Body')).toBeOnTheScreen();

      const [modal] = queryAllHostsByProps({ animationType: 'none' });
      modal?.props.onRequestClose();
      expect(onDismiss).not.toHaveBeenCalled();

      const [guard] = queryAllHostsByProps({ pointerEvents: 'none' });
      const key = { preventDefault: jest.fn(), stopPropagation: jest.fn() };
      guard?.props.onKeyDownCapture(key);
      expect(key.stopPropagation).toHaveBeenCalled();
      expect(key.preventDefault).toHaveBeenCalled();
    } finally {
      timing.mockRestore();
    }
  });

  it('scrolls its children inside a keyboard-avoiding view', async () => {
    await renderWithProviders(
      <AppDialog visible onDismiss={jest.fn()} accessibilityLabel="Tall">
        <Text>Body</Text>
      </AppDialog>,
    );
    expect(within(screen.getByTestId('kav')).getByText('Body')).toBeOnTheScreen();
    expect(getHostByType('RCTScrollView')).toBeTruthy();
  });

  it('keeps the scrim and card wrapper out of the web tab order', async () => {
    await renderWithProviders(
      <AppDialog visible onDismiss={jest.fn()} accessibilityLabel="Tall">
        <Text>Body</Text>
      </AppDialog>,
    );
    const nonControls = queryAllHostsByProps({ accessible: false });
    expect(nonControls).toHaveLength(2);
    for (const node of nonControls) expect(node.props.tabIndex).toBe(-1);
  });

  it('names the dialog for assistive tech', async () => {
    mockPlatform('web');
    // Without this the Modal renders role="dialog" + aria-modal with no accessible name,
    // and every dialog in the app announces as just "dialog".
    await renderWithProviders(
      <AppDialog visible onDismiss={jest.fn()} accessibilityLabel="Sign out">
        <Text>Body</Text>
      </AppDialog>,
    );
    expect(screen.getByLabelText('Sign out')).toBeOnTheScreen();
  });

  it('returns focus to the element that opened it', async () => {
    mockPlatform('web');
    const trigger = { focus: jest.fn(), isConnected: true };
    stubDocument(trigger);

    const { rerender } = await renderWithProviders(
      <AppDialog visible={false} onDismiss={jest.fn()} accessibilityLabel="Test dialog">
        <Text>Body</Text>
      </AppDialog>,
    );

    await rerender(
      <AppDialog visible onDismiss={jest.fn()} accessibilityLabel="Test dialog">
        <Text>Body</Text>
      </AppDialog>,
    );
    expect(trigger.focus).not.toHaveBeenCalled();
    expect(screen.getByText('Body')).toBeOnTheScreen();

    await rerender(
      <AppDialog visible={false} onDismiss={jest.fn()} accessibilityLabel="Test dialog">
        <Text>Body</Text>
      </AppDialog>,
    );

    expect(trigger.focus).toHaveBeenCalledTimes(1);
  });

  it('leaves focus alone when the trigger is gone', async () => {
    mockPlatform('web');
    const trigger = { focus: jest.fn(), isConnected: false };
    stubDocument(trigger);

    const { rerender } = await renderWithProviders(
      <AppDialog visible={false} onDismiss={jest.fn()} accessibilityLabel="Test dialog">
        <Text>Body</Text>
      </AppDialog>,
    );
    await rerender(
      <AppDialog visible onDismiss={jest.fn()} accessibilityLabel="Test dialog">
        <Text>Body</Text>
      </AppDialog>,
    );
    await rerender(
      <AppDialog visible={false} onDismiss={jest.fn()} accessibilityLabel="Test dialog">
        <Text>Body</Text>
      </AppDialog>,
    );

    expect(trigger.focus).not.toHaveBeenCalled();
  });

  it('restores native screen-reader focus to a passed-in triggerRef', async () => {
    mockPlatform('ios');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {});
    const triggerRef = createRef<View>();

    const { rerender } = await renderWithProviders(
      <>
        <View ref={triggerRef} />
        <AppDialog
          visible={false}
          onDismiss={jest.fn()}
          triggerRef={triggerRef}
          accessibilityLabel="Test dialog"
        >
          <Text>Body</Text>
        </AppDialog>
      </>,
    );

    await rerender(
      <>
        <View ref={triggerRef} />
        <AppDialog
          visible
          onDismiss={jest.fn()}
          triggerRef={triggerRef}
          accessibilityLabel="Test dialog"
        >
          <Text>Body</Text>
        </AppDialog>
      </>,
    );
    await rerender(
      <>
        <View ref={triggerRef} />
        <AppDialog
          visible={false}
          onDismiss={jest.fn()}
          triggerRef={triggerRef}
          accessibilityLabel="Test dialog"
        >
          <Text>Body</Text>
        </AppDialog>
      </>,
    );

    // A stray internal (unattached) ref would be null and never reach the event.
    expect(setFocus).toHaveBeenCalledWith(triggerRef.current as View, 'focus');
  });
});
