import { usePathname, useRouter } from 'expo-router';
import { BottomNav } from '@/components/base/BottomNav';
import {
  fireEvent,
  mockPlatform,
  renderWithProviders,
  restorePlatform,
  screen,
} from '@/test-utils';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
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

const replace = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  const { useBreakpoint } = jest.requireMock('@/hooks/useBreakpoint');
  (useRouter as jest.Mock).mockReturnValue({ replace });
  (usePathname as jest.Mock).mockReturnValue('/products');
  (useBreakpoint as jest.Mock).mockReturnValue({ isLg: false });
  mockUseAuth.mockReturnValue({ user: { id: '1' } });
  mockUseRpiIntegration.mockReturnValue({ enabled: true });
});

test('shows Products, Cameras, Account on /products at phone width', () => {
  renderWithProviders(<BottomNav />);
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.getByLabelText('Cameras')).toBeTruthy();
  expect(screen.getByLabelText('Account')).toBeTruthy();
});

test('renders nothing on a detail route', () => {
  (usePathname as jest.Mock).mockReturnValue('/products/42');
  renderWithProviders(<BottomNav />);
  expect(screen.queryByLabelText('Products')).toBeNull();
});

test('renders nothing at lg', () => {
  const { useBreakpoint } = jest.requireMock('@/hooks/useBreakpoint');
  (useBreakpoint as jest.Mock).mockReturnValue({ isLg: true });
  renderWithProviders(<BottomNav />);
  expect(screen.queryByLabelText('Products')).toBeNull();
});

test('hides Cameras when rpi integration is disabled', () => {
  mockUseRpiIntegration.mockReturnValue({ enabled: false });
  renderWithProviders(<BottomNav />);
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.queryByLabelText('Cameras')).toBeNull();
});

test('hides Account when signed out', () => {
  mockUseAuth.mockReturnValue({ user: null });
  renderWithProviders(<BottomNav />);
  expect(screen.getByLabelText('Products')).toBeTruthy();
  expect(screen.queryByLabelText('Account')).toBeNull();
});

test('marks the active tab as selected', () => {
  renderWithProviders(<BottomNav />);
  expect(screen.getByLabelText('Products').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getByLabelText('Cameras').props.accessibilityState).toEqual({ selected: false });
});

test('pressing a tab routes via replace', () => {
  renderWithProviders(<BottomNav />);
  fireEvent.press(screen.getByLabelText('Cameras'));
  expect(replace).toHaveBeenCalledWith('/cameras');
});

test('tabs carry active-state opacity feedback', () => {
  renderWithProviders(<BottomNav />);
  const className = screen.getByLabelText('Products').props.className as string;
  expect(className).toEqual(expect.stringContaining('active:opacity-60'));
});

test('tabs carry a web focus-visible ring', () => {
  mockPlatform('web');
  renderWithProviders(<BottomNav />);
  const className = screen.getByLabelText('Products').props.className as string;
  expect(className).toEqual(expect.stringContaining('focus-visible:ring'));
  restorePlatform();
});
