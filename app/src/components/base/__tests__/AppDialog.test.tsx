import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppDialog } from '@/components/base/AppDialog';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';

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
  it('returns focus to the element that opened it', () => {
    mockPlatform('web');
    const trigger = { focus: jest.fn(), isConnected: true };
    stubDocument(trigger);

    const { rerender } = renderWithProviders(
      <AppDialog visible={false} onDismiss={jest.fn()}>
        <Text>Body</Text>
      </AppDialog>,
    );

    rerender(
      <AppDialog visible onDismiss={jest.fn()}>
        <Text>Body</Text>
      </AppDialog>,
    );
    expect(trigger.focus).not.toHaveBeenCalled();
    expect(screen.getByText('Body')).toBeOnTheScreen();

    rerender(
      <AppDialog visible={false} onDismiss={jest.fn()}>
        <Text>Body</Text>
      </AppDialog>,
    );

    expect(trigger.focus).toHaveBeenCalledTimes(1);
  });

  it('leaves focus alone when the trigger is gone', () => {
    mockPlatform('web');
    const trigger = { focus: jest.fn(), isConnected: false };
    stubDocument(trigger);

    const { rerender } = renderWithProviders(
      <AppDialog visible={false} onDismiss={jest.fn()}>
        <Text>Body</Text>
      </AppDialog>,
    );
    rerender(
      <AppDialog visible onDismiss={jest.fn()}>
        <Text>Body</Text>
      </AppDialog>,
    );
    rerender(
      <AppDialog visible={false} onDismiss={jest.fn()}>
        <Text>Body</Text>
      </AppDialog>,
    );

    expect(trigger.focus).not.toHaveBeenCalled();
  });
});
