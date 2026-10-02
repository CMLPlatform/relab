import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react-native';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { mockPlatform, renderWithProviders, restorePlatform, setupUser } from '@/test-utils/index';

describe('InfoTooltip component', () => {
  const title = 'Test Tooltip Info';
  const user = setupUser();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    restorePlatform();
  });

  it('renders correctly on standard platforms', async () => {
    await renderWithProviders(<InfoTooltip title={title} />);
    expect(screen.getByTestId('info-icon')).toBeOnTheScreen();
  });

  it('handles mobile web path', async () => {
    mockPlatform('web');

    const originalUserAgent = global.navigator.userAgent;
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'iPhone',
      configurable: true,
    });

    await renderWithProviders(<InfoTooltip title={title} />);

    const pressable = screen.getByTestId('info-pressable');
    // 20px glyph + spacing.sm padding (36px) + 4px hitSlop/side = 44px a11y floor.
    expect(pressable.props.hitSlop).toBe(4);
    await user.press(pressable);

    expect(screen.getByText(title)).toBeOnTheScreen();

    await act(() => {
      jest.advanceTimersByTime(5000);
    });

    // No auto-dismiss: the tooltip stays until the user dismisses it.
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await user.press(screen.getByTestId('tooltip-scrim'));
    await waitFor(() => {
      expect(screen.queryByText(title)).toBeNull();
    });

    Object.defineProperty(global.navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it('toggles the bubble on a second press and stays open past the old timeout', async () => {
    await renderWithProviders(<InfoTooltip title={title} />);
    const button = screen.getByRole('button', { name: `Info: ${title}` });
    await user.press(button);
    expect(screen.getByText(title)).toBeOnTheScreen();
    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText(title)).toBeOnTheScreen();
    await user.press(button);
    expect(screen.queryByText(title)).toBeNull();
  });

  it('hides on blur', async () => {
    await renderWithProviders(<InfoTooltip title={title} />);
    const button = screen.getByRole('button', { name: `Info: ${title}` });
    await user.press(button);
    expect(screen.getByText(title)).toBeOnTheScreen();
    await act(() => {
      button.props.onBlur?.();
    });
    expect(screen.queryByText(title)).toBeNull();
  });

  it('clears timer on unmount', async () => {
    const { unmount } = await renderWithProviders(<InfoTooltip title={title} />);
    await unmount();
  });
});
