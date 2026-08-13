import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { BOTTOM_NAV_CLEARANCE } from '@/components/base/useBottomNav';
import { ActiveStreamBanner } from '@/components/cameras/ActiveStreamBanner';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { mockPlatform, renderWithProviders, restorePlatform } from '@/test-utils/index';

const mockStreamingSheet = jest.fn();
const mockUseStreamSession = jest.fn();
const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => mockInsets,
}));

const mockUseBottomNavVisible = jest.fn();

// Kept in sync by hand with ActiveStreamBanner.tsx's own SAVE_BAR_DOCK_RESERVE,
// which isn't exported (component-only file, react-refresh/only-export-components).
const SAVE_BAR_DOCK_RESERVE = 400;

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

jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: jest.fn(),
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
    mockInsets.bottom = 0;
    (usePathname as jest.Mock).mockReturnValue('/products');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: false, isLg: false });
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

  // The banner is mounted at the app root, outside the tab navigator, so the
  // bar overlaps it on native exactly as it does on web — nothing shrinks the
  // box it positions against. Without this bump the banner would sit straight
  // through a detail screen's Fab once the bar lifts that Fab.
  it('bumps its floating offset on native too when BottomNav is visible', () => {
    mockPlatform('ios');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    mockUseBottomNavVisible.mockReturnValue(false);
    const { rerender } = renderWithProviders(<ActiveStreamBanner />);
    const hiddenBottom = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    mockUseBottomNavVisible.mockReturnValue(true);
    rerender(<ActiveStreamBanner />);
    const visibleBottom = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    // Safe-area insets are 0 in the test provider, so this is the bar's height
    // without its bottom padding; the padding term is asserted below.
    expect(visibleBottom - hiddenBottom).toBe(BOTTOM_NAV_CLEARANCE);
  });

  // A notched device pads the bar by the safe-area inset on top of its own
  // height; leaving that term out is what re-introduces the Fab overlap.
  it('adds the safe-area inset the bar pads itself with', () => {
    mockPlatform('ios');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    mockUseBottomNavVisible.mockReturnValue(true);
    const { rerender } = renderWithProviders(<ActiveStreamBanner />);
    const flat = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    mockInsets.bottom = 34;
    rerender(<ActiveStreamBanner />);
    const notched = screen.getByTestId('active-stream-banner-float').props.style.bottom;

    expect(notched - flat).toBe(34);
  });

  // SaveBar (product/component detail, >=md web) docks fixed at right:24 and
  // can be wide enough to sit under the banner's default right:16 — the
  // banner reserves SAVE_BAR_DOCK_RESERVE instead whenever the route+
  // breakpoint combination could render SaveBar (see ActiveStreamBanner.tsx).
  it('reserves space for SaveBar on a >=md web product detail route', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/products/42');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(
      SAVE_BAR_DOCK_RESERVE,
    );
  });

  it('reserves space for SaveBar on a >=md web component detail route', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/components/7');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(
      SAVE_BAR_DOCK_RESERVE,
    );
  });

  // Regression: '/products/new' (CaptureScreen, no SaveBar) satisfies
  // '/products/:id' too, since the literal 'new' segment matches [^/]+ just
  // like a real id would — the route predicate must exclude it explicitly.
  it('does not reserve space on the /products/new creation route', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/products/new');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(16);
  });

  it('does not reserve space on a product list route even at >=md web', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/products');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(16);
  });

  it('does not reserve space on a detail route below md web width', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/products/42');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: false, isLg: false });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(16);
  });

  it('does not reserve space on a nested detail sub-route (no SaveBar there)', () => {
    mockPlatform('web');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/products/42/components/new');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(16);
  });

  it('does not reserve space on native even on a detail route (SaveBar is web-only)', () => {
    mockPlatform('ios');
    mockUseStreamSession.mockReturnValue({ activeStream: session });
    (usePathname as jest.Mock).mockReturnValue('/products/42');
    (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByTestId('active-stream-banner-float').props.style.right).toBe(16);
  });
});
