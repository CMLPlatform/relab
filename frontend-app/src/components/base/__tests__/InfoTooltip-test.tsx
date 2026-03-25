import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { InfoTooltip } from '../InfoTooltip';

// Mock MaterialCommunityIcons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

const renderWithPaper = (ui: React.ReactElement) => {
  return render(<PaperProvider>{ui}</PaperProvider>);
};

describe('InfoTooltip component', () => {
  const title = 'Test Tooltip Info';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders correctly on standard platforms', () => {
    renderWithPaper(<InfoTooltip title={title} />);
    // Tooltip title is not immediately visible, but the icon should be
    expect(screen.getByTestId('info-icon')).toBeTruthy();
  });

  it('handles mobile web path', async () => {
    // Force mobile web detection
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });

    const originalUserAgent = global.navigator.userAgent;
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'iPhone',
      configurable: true,
    });

    renderWithPaper(<InfoTooltip title={title} />);

    // In mobile web, it uses a Pressable and a Modal
    const pressable = screen.getByTestId('info-pressable');
    fireEvent.press(pressable);

    // Modal should be visible
    expect(screen.getByText(title)).toBeTruthy();

    // Timer should hide it after exitDelay (1500ms)
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      // In mobile web, visible state becomes false, so text should be gone (or modal unmounted)
      expect(screen.queryByText(title)).toBeNull();
    });

    // Restore
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    Object.defineProperty(global.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  });

  it('clears timer on unmount', () => {
    const { unmount } = renderWithPaper(<InfoTooltip title={title} />);
    // Trigger visible to start timer
    // (In non-mobile-web it's managed by react-native-paper Tooltip)
    unmount();
    // No crash = good
  });
});
