import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { BOTTOM_NAV_CLEARANCE } from '@/components/base/useBottomNav';
import { ActiveStreamBanner } from '@/components/cameras/ActiveStreamBanner';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';

const mockStreamingSheet = jest.fn();
const mockUseStreamSession = jest.fn();
const mockUseBottomNavVisible = jest.fn();

jest.mock('@/components/cameras/StreamingSheet', () => ({
  StreamingSheet: (props: unknown) => {
    mockStreamingSheet(props);
    return null;
  },
}));

jest.mock('@/context/streamSession', () => ({
  ...jest.requireActual<typeof import('@/context/streamSession')>('@/context/streamSession'),
  useStreamSession: () => mockUseStreamSession(),
}));

jest.mock('@/hooks/useElapsed', () => ({
  useElapsed: () => '1:23',
}));

// Real BOTTOM_NAV_CLEARANCE constant stays live (imported above); only the
// hook's own routing/breakpoint/auth reads are stubbed so this suite doesn't
// have to mock expo-router/useBreakpoint/useAuth/useVisibleDestinations too.
jest.mock('@/components/base/useBottomNav', () => ({
  ...jest.requireActual<typeof import('@/components/base/useBottomNav')>(
    '@/components/base/useBottomNav',
  ),
  useBottomNavVisible: () => mockUseBottomNavVisible(),
}));

describe('ActiveStreamBanner', () => {
  const session = {
    cameraId: 'cam-1',
    cameraName: 'Bench Cam',
    productId: 42,
    productName: 'Desk Radio',
    startedAt: '2026-01-01T00:00:00.000Z',
    youtubeUrl: 'https://youtube.test/watch?v=123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBottomNavVisible.mockReturnValue(false);
  });

  afterEach(() => {
    restorePlatform();
  });

  it('renders nothing when there is no active stream', () => {
    mockUseStreamSession.mockReturnValue({ activeStream: null });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.queryByLabelText('Manage live stream')).toBeNull();
    expect(mockStreamingSheet).not.toHaveBeenCalled();
  });

  it('renders the active stream banner and opens the sheet when pressed', () => {
    mockUseStreamSession.mockReturnValue({ activeStream: session });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByText('Desk Radio')).toBeOnTheScreen();
    expect(screen.getByText('1:23')).toBeOnTheScreen();
    expect(mockStreamingSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: false,
        session,
      }),
    );

    fireEvent.press(screen.getByLabelText('Manage live stream'));

    expect(mockStreamingSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        session,
      }),
    );
  });

  it('bumps its floating offset by BOTTOM_NAV_CLEARANCE on web when BottomNav is visible (top-level route)', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = renderWithProviders(<ActiveStreamBanner />);
    const hiddenBottom = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ActiveStreamBanner />);
    const visibleBottom = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    expect(visibleBottom - hiddenBottom).toBe(BOTTOM_NAV_CLEARANCE);
  });

  // On native, BottomNav renders in normal flow and already shrinks the
  // container the banner sits in — bumping here too would double-clear it
  // (88 + 60 of dead space on tab routes).
  it('does not add clearance on native even when BottomNav is visible', () => {
    mockPlatform('ios');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = renderWithProviders(<ActiveStreamBanner />);
    const hiddenBottom = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ActiveStreamBanner />);
    const visibleBottom = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    expect(visibleBottom).toBe(hiddenBottom);
  });
});
