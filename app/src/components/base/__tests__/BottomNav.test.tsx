import { useSegments } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BottomNav } from '@/components/base/BottomNav';
import {
  fireEvent,
  mockPlatform,
  renderWithProviders,
  restorePlatform,
  screen,
} from '@/test-utils';

jest.mock('expo-router', () => ({
  useSegments: jest.fn(),
}));

jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: jest.fn(),
}));

const mockUseAuth = jest.fn();
jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseRpiIntegration = jest.fn();
jest.mock('@/features/cameras/rpi/useRpiIntegration', () => ({
  useRpiIntegration: () => mockUseRpiIntegration(),
}));

const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));
const TAB_ROUTES = ['(products)', '(cameras)', '(account)'];

/** The slice of BottomTabBarProps this bar actually reads. */
function renderBar(activeIndex = 0) {
  const props = {
    state: {
      index: activeIndex,
      routes: TAB_ROUTES.map((name) => ({ key: `${name}-key`, name })),
    },
    navigation: { navigate, emit },
  } as unknown as BottomTabBarProps;
  return renderWithProviders(<BottomNav {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  const { useBreakpoint } = jest.requireMock('@/hooks/useBreakpoint');
  (useSegments as jest.Mock).mockReturnValue(['(tabs)', '(products)', 'products', 'index']);
  (useBreakpoint as jest.Mock).mockReturnValue({ isLg: false });
  emit.mockReturnValue({ defaultPrevented: false });
  mockUseAuth.mockReturnValue({ user: { id: '1' } });
  mockUseRpiIntegration.mockReturnValue({ enabled: true });
});

test('shows Products, Cameras, Account inside the tab group at phone width', () => {
  renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.getByLabelText('Cameras')).toBeTruthy();
  expect(screen.getByLabelText('Account')).toBeTruthy();
});

// The point of the tab groups: a detail screen belongs to a tab, so the bar
// stays put and every other tab is still one tap away.
test('stays visible on a detail screen inside a tab', () => {
  (useSegments as jest.Mock).mockReturnValue(['(tabs)', '(products)', 'products', '[id]']);
  renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
});

test('renders nothing outside the tab group', () => {
  (useSegments as jest.Mock).mockReturnValue(['category-selection']);
  renderBar();
  expect(screen.queryByLabelText('Products')).toBeNull();
});

test('renders nothing at lg', () => {
  const { useBreakpoint } = jest.requireMock('@/hooks/useBreakpoint');
  (useBreakpoint as jest.Mock).mockReturnValue({ isLg: true });
  renderBar();
  expect(screen.queryByLabelText('Products')).toBeNull();
});

test('hides Cameras when rpi integration is disabled', () => {
  mockUseRpiIntegration.mockReturnValue({ enabled: false });
  renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.queryByLabelText('Cameras')).toBeNull();
});

test('hides Account when signed out', () => {
  mockUseAuth.mockReturnValue({ user: null });
  renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.queryByLabelText('Account')).toBeNull();
});

test('marks the navigator’s focused tab as selected', () => {
  renderBar(1);
  expect(screen.getByLabelText('Cameras').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getByLabelText('Products').props.accessibilityState).toEqual({ selected: false });
});

// Navigating by route name (not href) is what returns the user to that tab's
// preserved trail instead of resetting it to the tab's root screen.
test('pressing an unfocused tab navigates to its route name', () => {
  renderBar();
  fireEvent.press(screen.getByLabelText('Cameras'));
  expect(navigate).toHaveBeenCalledWith('(cameras)');
});

// tabPress is the event the focused tab's own listeners (the nested stack's
// pop-to-top) hang off; re-navigating on top of it would be a no-op at best.
test('pressing the focused tab emits tabPress instead of navigating', () => {
  renderBar();
  fireEvent.press(screen.getByLabelText('Products'));
  expect(emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: '(products)-key',
    canPreventDefault: true,
  });
  expect(navigate).not.toHaveBeenCalled();
});

test('a listener that prevents the default press blocks the navigation', () => {
  emit.mockReturnValue({ defaultPrevented: true });
  renderBar();
  fireEvent.press(screen.getByLabelText('Cameras'));
  expect(emit).toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test('tabs carry active-state opacity feedback', () => {
  renderBar();
  const className = screen.getByLabelText('Products').props.className as string;
  expect(className).toEqual(expect.stringContaining('active:opacity-60'));
});

test('tabs carry a web focus-visible ring', () => {
  mockPlatform('web');
  renderBar();
  const className = screen.getByLabelText('Products').props.className as string;
  // Asserts the outline mechanism, not `ring`. Tailwind's ring compiles to a
  // box-shadow layer that never composed here (these controls also carry
  // `shadow-none`), so the old assertion passed while focus painted nothing at
  // all. Outline cannot be clipped and does not depend on shadow composition.
  expect(className).toEqual(expect.stringContaining('focus-visible:outline-2'));
  expect(className).toEqual(expect.stringContaining('focus-visible:outline-ring'));
  // The style utility is the one that was missing and made the indicator
  // invisible while width and colour computed correctly. A class-string test
  // cannot prove it paints — see the e2e focus test for that — but it can stop
  // this specific utility being dropped again.
  expect(className).toEqual(expect.stringContaining('focus-visible:outline-solid'));
  restorePlatform();
});
