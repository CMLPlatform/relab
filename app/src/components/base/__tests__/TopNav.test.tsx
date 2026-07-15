import { fireEvent, render, screen } from '@testing-library/react-native';
import { usePathname, useRouter } from 'expo-router';
import { TopNav } from '@/components/base/TopNav';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: jest.fn(),
}));

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(() => ({ user: null })),
}));

const mockUseRpiIntegration = jest.fn();
jest.mock('@/features/cameras/rpi/useRpiIntegration', () => ({
  useRpiIntegration: () => mockUseRpiIntegration(),
}));

const push = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform('web');
  (useRouter as jest.Mock).mockReturnValue({ push });
  (usePathname as jest.Mock).mockReturnValue('/products');
  mockUseRpiIntegration.mockReturnValue({ enabled: true });
});

afterEach(() => {
  restorePlatform();
});

test('renders nothing below lg', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: false });
  render(<TopNav />);
  expect(screen.queryByText('Products')).toBeNull();
});

test('renders destinations at lg', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  render(<TopNav />);
  expect(screen.getByText('Products')).toBeOnTheScreen();
  expect(screen.getByText('Cameras')).toBeOnTheScreen();
});

test('marks the active destination from the pathname', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  (usePathname as jest.Mock).mockReturnValue('/cameras');
  render(<TopNav />);
  expect(screen.getByLabelText('Cameras, current page')).toBeOnTheScreen();
  expect(screen.getByLabelText('Products')).toBeOnTheScreen();
});

test('marks the active destination on a detail route (prefix match)', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  (usePathname as jest.Mock).mockReturnValue('/products/123');
  render(<TopNav />);
  expect(screen.getByLabelText('Products, current page')).toBeOnTheScreen();
  expect(screen.getByLabelText('Cameras')).toBeOnTheScreen();
});

test('pressing a destination routes', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  render(<TopNav />);
  fireEvent.press(screen.getByText('Cameras'));
  expect(push).toHaveBeenCalledWith('/cameras');
});

test('destinations have a web hover affordance', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  render(<TopNav />);
  expect(screen.getByLabelText('Cameras').props.className).toEqual(
    expect.stringContaining('hover:'),
  );
});

test('hides Cameras when rpi cameras are disabled', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  mockUseRpiIntegration.mockReturnValue({ enabled: false });
  render(<TopNav />);
  expect(screen.getByText('Products')).toBeOnTheScreen();
  expect(screen.queryByText('Cameras')).toBeNull();
});

test('shows Cameras when rpi cameras are enabled', () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  mockUseRpiIntegration.mockReturnValue({ enabled: true });
  render(<TopNav />);
  expect(screen.getByText('Products')).toBeOnTheScreen();
  expect(screen.getByText('Cameras')).toBeOnTheScreen();
});

test.each([
  '/',
  '/login',
  '/onboarding',
  '/new-account',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/category-selection',
])('renders nothing on the chrome-free route %s, even at lg', (path) => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  (usePathname as jest.Mock).mockReturnValue(path);
  render(<TopNav />);
  expect(screen.queryByText('Products')).toBeNull();
});
