import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Text, View } from 'react-native';
import { AppDialog } from '@/components/base/AppDialog';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  findNodeHandle: jest.fn(() => 7),
}));

const mockedFindNodeHandle = jest.mocked(findNodeHandle);

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
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => {});
    const triggerRef = createRef<View>();
    // Only resolves a handle for the externally-supplied ref, so a stray
    // internal (unattached) ref can't make this pass by accident.
    mockedFindNodeHandle.mockImplementation((component) =>
      component === triggerRef.current ? 7 : null,
    );

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

    expect(setFocus).toHaveBeenCalledWith(7);
  });
});
