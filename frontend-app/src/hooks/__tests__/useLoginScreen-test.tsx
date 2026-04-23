import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useLoginScreen } from '@/hooks/auth/useLoginScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
  );
  return {
    ...actual,
    useDialog: () => ({
      alert: jest.fn(),
    }),
  };
});

jest.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: () => 'light',
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: { field: 'control' },
    handleSubmit: (handler: (values: { email: string; password: string }) => Promise<void>) => () =>
      handler({ email: 'test@example.com', password: 'password123' }),
  }),
}));

jest.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => jest.fn(),
}));

jest.mock('@/services/api/authentication', () => ({
  login: jest.fn(),
  getUser: jest.fn(),
  markWebSessionActive: jest.fn(),
}));

jest.mock('@/services/api/oauthFlow', () => ({
  buildOAuthAuthorizeUrl: jest.fn(),
  fetchOAuthAuthorizationUrl: jest.fn(),
  openOAuthBrowserSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('exp://localhost/login'),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

describe('useLoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns grouped ui, form, and action domains', () => {
    const { result } = renderHook(() => useLoginScreen());

    expect(result.current.ui.colorScheme).toBe('light');
    expect(result.current.ui.keyboardShown).toBe(false);
    expect(result.current.form.control).toEqual({ field: 'control' });
    expect(typeof result.current.form.submit).toBe('function');
    expect(typeof result.current.actions.loginWithGoogle).toBe('function');
  });

  it('uses named navigation actions for browse, forgot password, and create account', () => {
    const { result } = renderHook(() => useLoginScreen());

    result.current.actions.browseProducts();
    result.current.actions.goToForgotPassword();
    result.current.actions.goToCreateAccount();

    expect(mockReplace).toHaveBeenCalledWith('/products');
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
    expect(mockPush).toHaveBeenCalledWith('/new-account');
  });
});
