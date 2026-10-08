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
jest.mock('@/features/cameras/serverPreferenceToggle', () => ({
  useServerPreferenceToggle: () => mockUseRpiIntegration(),
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

test('shows Products, Cameras, Account inside the tab group at phone width', async () => {
  await renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.getByLabelText('Cameras')).toBeTruthy();
  expect(screen.getByLabelText('Account')).toBeTruthy();
});

// The point of the tab groups: a detail screen belongs to a tab, so the bar
// stays put and every other tab is still one tap away.
test('stays visible on a detail screen inside a tab', async () => {
  (useSegments as jest.Mock).mockReturnValue(['(tabs)', '(products)', 'products', '[id]']);
  await renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
});

test('renders nothing outside the tab group', async () => {
  (useSegments as jest.Mock).mockReturnValue(['category-selection']);
  await renderBar();
  expect(screen.queryByLabelText('Products')).toBeNull();
});

test('renders nothing at lg', async () => {
  const { useBreakpoint } = jest.requireMock('@/hooks/useBreakpoint');
  (useBreakpoint as jest.Mock).mockReturnValue({ isLg: true });
  await renderBar();
  expect(screen.queryByLabelText('Products')).toBeNull();
});

test('hides Cameras when rpi integration is disabled', async () => {
  mockUseRpiIntegration.mockReturnValue({ enabled: false });
  await renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.queryByLabelText('Cameras')).toBeNull();
});

test('hides Account when signed out', async () => {
  mockUseAuth.mockReturnValue({ user: null });
  await renderBar();
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.queryByLabelText('Account')).toBeNull();
});

// Destinations are links, not tabs: a tab implies an in-page tabpanel. Like
// TopNav, the current one carries aria-current="page" for the web; native
// screen readers read the selected state instead.
test('marks the navigator’s focused destination as the current page', async () => {
  await renderBar(1);
  expect(screen.getByRole('link', { name: 'Cameras' })).toBeOnTheScreen();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByLabelText('Cameras').props['aria-current']).toBe('page');
  expect(screen.getByLabelText('Products').props['aria-current']).toBeUndefined();
  expect(screen.getByLabelText('Cameras').props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByLabelText('Products').props.accessibilityState).toMatchObject({
    selected: false,
  });
});

test('keeps aria-selected off the web, where it is invalid on a link', async () => {
  mockPlatform('web');
  await renderBar(1);
  expect(screen.getByLabelText('Cameras').props['aria-selected']).toBeUndefined();
  expect(screen.getByLabelText('Cameras').props.accessibilityState?.selected).toBeUndefined();
  restorePlatform();
});

// Navigating by route name (not href) is what returns the user to that tab's
// preserved trail instead of resetting it to the tab's root screen.
test('pressing an unfocused tab navigates to its route name', async () => {
  await renderBar();
  await fireEvent.press(screen.getByLabelText('Cameras'));
  expect(navigate).toHaveBeenCalledWith('(cameras)');
});

// tabPress is the event the focused tab's own listeners (the nested stack's
// pop-to-top) hang off; re-navigating on top of it would be a no-op at best.
test('pressing the focused tab emits tabPress instead of navigating', async () => {
  await renderBar();
  await fireEvent.press(screen.getByLabelText('Products'));
  expect(emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: '(products)-key',
    canPreventDefault: true,
  });
  expect(navigate).not.toHaveBeenCalled();
});

test('a listener that prevents the default press blocks the navigation', async () => {
  emit.mockReturnValue({ defaultPrevented: true });
  await renderBar();
  await fireEvent.press(screen.getByLabelText('Cameras'));
  expect(emit).toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test('tabs press to the One Tint, not an opacity dim', async () => {
  await renderBar();
  const className = screen.getByLabelText('Products').props.className as string;
  expect(className).toEqual(expect.stringContaining('active:bg-primary/12'));
  expect(className).not.toEqual(expect.stringContaining('active:opacity'));
});

test('tabs carry a web focus-visible ring', async () => {
  mockPlatform('web');
  await renderBar();
  const className = screen.getByLabelText('Products').props.className as string;
  // Asserts the outline mechanism, not `ring`. Tailwind's ring compiles to a
  // box-shadow layer that never composed here (these controls also carry
  // `shadow-none`), so asserting `ring` passes while focus paints nothing at
  // all. Outline cannot be clipped and does not depend on shadow composition.
  expect(className).toEqual(expect.stringContaining('focus-visible:outline-2'));
  expect(className).toEqual(expect.stringContaining('focus-visible:outline-ring'));
  // Without the style utility the indicator is invisible even though width and
  // colour compute correctly. A class-string test cannot prove it paints (see
  // the e2e focus test for that), but it can stop this utility being dropped.
  expect(className).toEqual(expect.stringContaining('focus-visible:outline-solid'));
  restorePlatform();
});
