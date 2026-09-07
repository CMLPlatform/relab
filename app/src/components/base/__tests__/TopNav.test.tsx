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
const navigate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform('web');
  (useRouter as jest.Mock).mockReturnValue({ push, navigate });
  (usePathname as jest.Mock).mockReturnValue('/products');
  mockUseRpiIntegration.mockReturnValue({ enabled: true });
});

afterEach(() => {
  restorePlatform();
});

test('renders nothing below lg', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: false });
  await render(<TopNav />);
  expect(screen.queryByText('Products')).toBeNull();
});

test('renders destinations at lg', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  await render(<TopNav />);
  expect(screen.getByText('Products')).toBeOnTheScreen();
  expect(screen.getByText('Cameras')).toBeOnTheScreen();
});

test('marks the active destination from the pathname', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  (usePathname as jest.Mock).mockReturnValue('/cameras');
  await render(<TopNav />);
  expect(screen.getByLabelText('Cameras, current page')).toBeOnTheScreen();
  expect(screen.getByLabelText('Products')).toBeOnTheScreen();
});

test('marks the active destination on a detail route (prefix match)', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  (usePathname as jest.Mock).mockReturnValue('/products/123');
  await render(<TopNav />);
  expect(screen.getByLabelText('Products, current page')).toBeOnTheScreen();
  expect(screen.getByLabelText('Cameras')).toBeOnTheScreen();
});

test('pressing a destination routes', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  await render(<TopNav />);
  await fireEvent.press(screen.getByText('Cameras'));
  expect(navigate).toHaveBeenCalledWith('/cameras');
});

test('destinations have a web hover affordance', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  await render(<TopNav />);
  expect(screen.getByLabelText('Cameras').props.className).toEqual(
    expect.stringContaining('hover:'),
  );
});

test('hides Cameras when rpi cameras are disabled', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  mockUseRpiIntegration.mockReturnValue({ enabled: false });
  await render(<TopNav />);
  expect(screen.getByText('Products')).toBeOnTheScreen();
  expect(screen.queryByText('Cameras')).toBeNull();
});

test('shows Cameras when rpi cameras are enabled', async () => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  mockUseRpiIntegration.mockReturnValue({ enabled: true });
  await render(<TopNav />);
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
])('renders nothing on the chrome-free route %s, even at lg', async (path) => {
  (useBreakpoint as jest.Mock).mockReturnValue({ isMd: true, isLg: true });
  (usePathname as jest.Mock).mockReturnValue(path);
  await render(<TopNav />);
  expect(screen.queryByText('Products')).toBeNull();
});
