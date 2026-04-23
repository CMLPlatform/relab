import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react-native';
import { mockPlatform, renderWithProviders, restorePlatform, setupUser } from '@/test-utils/index';
import { InfoTooltip } from '../InfoTooltip';

// Mock MaterialCommunityIcons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

describe('InfoTooltip component', () => {
  const title = 'Test Tooltip Info';
  const user = setupUser();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    restorePlatform();
  });

  it('renders correctly on standard platforms', () => {
    renderWithProviders(<InfoTooltip title={title} />);
    expect(screen.getByTestId('info-icon')).toBeOnTheScreen();
  });

  it('handles mobile web path', async () => {
    mockPlatform('web');

    const originalUserAgent = global.navigator.userAgent;
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'iPhone',
      configurable: true,
    });

    renderWithProviders(<InfoTooltip title={title} />);

    const pressable = screen.getByTestId('info-pressable');
    await user.press(pressable);

    expect(screen.getByText(title)).toBeOnTheScreen();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.queryByText(title)).toBeNull();
    });

    Object.defineProperty(global.navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it('clears timer on unmount', () => {
    const { unmount } = renderWithProviders(<InfoTooltip title={title} />);
    unmount();
  });
});
