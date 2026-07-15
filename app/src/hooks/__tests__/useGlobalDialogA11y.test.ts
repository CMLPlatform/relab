import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useGlobalDialogA11y } from '@/hooks/useGlobalDialogA11y';

// Mirrors useGalleryKeyboardNavigation.test.tsx's web-platform + window mock.
describe('useGlobalDialogA11y', () => {
  const originalPlatform = Platform.OS;
  const addEventListener = jest.fn();
  const removeEventListener = jest.fn();
  const observe = jest.fn();
  const disconnect = jest.fn();
  // Captures the callback passed to `new MutationObserver(cb)` so tests can
  // fire it manually to simulate the modal-wrapper node appearing/disappearing.
  let mutationCallback: (() => void) | undefined;
  class MockMutationObserver {
    constructor(callback: () => void) {
      mutationCallback = callback;
    }
    observe = observe;
    disconnect = disconnect;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mutationCallback = undefined;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      value: MockMutationObserver,
    });
    // Base default so mount doesn't throw on `document.body` in tests that
    // don't need a fuller document mock; per-test overrides below replace it.
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  function mountAndGetHandler(): (event: Partial<KeyboardEvent>) => void {
    renderHook(() => useGlobalDialogA11y());
    return addEventListener.mock.calls[0][1] as (event: Partial<KeyboardEvent>) => void;
  }

  it('registers a keydown listener only on web', () => {
    renderHook(() => useGlobalDialogA11y());
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does nothing when no dialog is open', () => {
    const querySelector = jest.fn().mockReturnValue(null);
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector } });

    const handleKeyDown = mountAndGetHandler();
    handleKeyDown({ key: 'Escape' });

    expect(querySelector).toHaveBeenCalledWith('[data-testid="modal-wrapper"]');
  });

  it('Escape clicks the backdrop to dismiss the open dialog', () => {
    const backdropClick = jest.fn();
    const querySelector = jest.fn((selector: string) => {
      if (selector.includes('wrapper')) return {};
      if (selector.includes('backdrop')) return { click: backdropClick };
      return null;
    });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector } });

    const handleKeyDown = mountAndGetHandler();
    handleKeyDown({ key: 'Escape' });

    expect(backdropClick).toHaveBeenCalled();
  });

  it('Tab from the last focusable element wraps to the first', () => {
    const first = { focus: jest.fn(), hasAttribute: () => false };
    const last = { focus: jest.fn(), hasAttribute: () => false };
    const wrapper = {
      querySelectorAll: jest.fn().mockReturnValue([first, last]),
      contains: (el: unknown) => el === first || el === last,
    };
    const querySelector = jest.fn().mockReturnValue(wrapper);
    const preventDefault = jest.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector, activeElement: last },
    });

    const handleKeyDown = mountAndGetHandler();
    handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(first.focus).toHaveBeenCalled();
  });

  it('Tab redirects focus into the dialog when it starts outside it', () => {
    const first = { focus: jest.fn(), hasAttribute: () => false };
    const wrapper = {
      querySelectorAll: jest.fn().mockReturnValue([first]),
      contains: () => false,
    };
    const querySelector = jest.fn().mockReturnValue(wrapper);
    const preventDefault = jest.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector, activeElement: { outside: true } },
    });

    const handleKeyDown = mountAndGetHandler();
    handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(first.focus).toHaveBeenCalled();
  });

  it('restores focus to the trigger element after the dialog closes', () => {
    const trigger = { focus: jest.fn() };
    let wrapperOpen = true;
    const querySelector = jest.fn(() => (wrapperOpen ? {} : null));
    const contains = jest.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector, activeElement: trigger, contains },
    });

    renderHook(() => useGlobalDialogA11y());
    mutationCallback?.(); // dialog opens: captures `trigger` as document.activeElement

    wrapperOpen = false;
    mutationCallback?.(); // dialog closes: should restore focus

    expect(trigger.focus).toHaveBeenCalled();
  });

  it('does not restore focus if the trigger element left the document', () => {
    const trigger = { focus: jest.fn() };
    let wrapperOpen = true;
    const querySelector = jest.fn(() => (wrapperOpen ? {} : null));
    const contains = jest.fn().mockReturnValue(false);
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector, activeElement: trigger, contains },
    });

    renderHook(() => useGlobalDialogA11y());
    mutationCallback?.();

    wrapperOpen = false;
    mutationCallback?.();

    expect(trigger.focus).not.toHaveBeenCalled();
  });
});
