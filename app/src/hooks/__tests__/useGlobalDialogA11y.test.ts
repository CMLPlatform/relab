import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useGlobalDialogA11y } from '@/hooks/useGlobalDialogA11y';

// Mirrors useGalleryKeyboardNavigation.test.tsx's web-platform + window mock.
describe('useGlobalDialogA11y', () => {
  const originalPlatform = Platform.OS;
  const addEventListener = jest.fn();
  const removeEventListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
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
});
