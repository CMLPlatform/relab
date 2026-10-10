import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { FramedAuthNotice } from '@/components/auth/FramedAuthNotice';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';
import { isFramed } from '@/utils/platformLayout';

const setTop = (top: unknown) =>
  Object.defineProperty(window, 'top', { value: top, configurable: true });

afterEach(() => {
  restorePlatform();
  setTop(window.self);
  jest.restoreAllMocks();
});

describe('isFramed', () => {
  it('is false on native, even if window.top differs', () => {
    mockPlatform('ios');
    setTop({});
    expect(isFramed()).toBe(false);
  });

  it('is false on web in a top-level tab', () => {
    mockPlatform('web');
    expect(isFramed()).toBe(false);
  });

  it('is true on web inside an iframe', () => {
    mockPlatform('web');
    setTop({});
    expect(isFramed()).toBe(true);
  });
});

describe('FramedAuthNotice', () => {
  it('opens the current page in a new tab without an opener', async () => {
    mockPlatform('web');
    const open = jest.fn();
    Object.defineProperty(window, 'open', { value: open, configurable: true });
    const href = 'https://app.example.org/login';
    Object.defineProperty(window, 'location', { value: { href }, configurable: true });

    await renderWithProviders(<FramedAuthNotice />);
    fireEvent.press(screen.getByText('Open R9lab in a new tab'));

    expect(open).toHaveBeenCalledWith(href, '_blank', 'noopener');
  });
});
