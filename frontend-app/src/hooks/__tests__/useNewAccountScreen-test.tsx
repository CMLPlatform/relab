import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useNewAccountScreen } from '@/hooks/auth/useNewAccountScreen';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockAlert = jest.fn();
const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockRefetch = jest.fn();
const mockTrigger = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    dismissTo: mockDismissTo,
  }),
}));

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
  );
  return {
    ...actual,
    useDialog: () => ({
      alert: mockAlert,
    }),
  };
});

jest.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    refetch: mockRefetch,
  }),
}));

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: () => 'light',
}));

jest.mock('@/theme', () => ({
  useAppTheme: () => ({
    scheme: 'light',
    colors: {
      onBackground: '#111111',
    },
    tokens: {
      overlay: { glass: 'rgba(0,0,0,0.07)' },
      text: { muted: '#999999' },
    },
  }),
}));

jest.mock('@/services/api/authentication', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: { field: 'control' },
    formState: {
      errors: {},
      isSubmitting: false,
    },
    watch: () => 'newuser',
    trigger: (...args: unknown[]) => mockTrigger(...args),
    handleSubmit:
      (handler: (values: { username: string; email: string; password: string }) => Promise<void>) =>
      () =>
        handler({
          username: 'newuser',
          email: 'user@example.com',
          password: 'password123',
        }),
  }),
  useWatch: () => 'newuser',
}));

jest.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => jest.fn(),
}));

describe('useNewAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrigger.mockImplementation(async () => true);
    mockRegister.mockImplementation(async () => ({ success: true }));
    mockLogin.mockImplementation(async () => 'access-token');
    mockRefetch.mockImplementation(async () => undefined);
  });

  it('returns grouped ui, flow, form, and action domains', () => {
    const { result } = renderHook(() => useNewAccountScreen());

    expect(result.current.ui.colorScheme).toBe('light');
    expect(result.current.flow.section).toBe('username');
    expect(result.current.flow.username).toBe('newuser');
    expect(result.current.form.control).toEqual({ field: 'control' });
    expect(typeof result.current.actions.goToLogin).toBe('function');
  });

  it('uses named flow actions to advance and go back between sections', async () => {
    const { result } = renderHook(() => useNewAccountScreen());

    await act(async () => {
      await result.current.actions.advanceFromUsername();
    });
    expect(result.current.flow.section).toBe('email');

    act(() => {
      result.current.actions.goBackToUsername();
    });
    expect(result.current.flow.section).toBe('username');

    await act(async () => {
      await result.current.actions.advanceFromUsername();
      await result.current.actions.advanceFromEmail();
    });
    expect(result.current.flow.section).toBe('password');

    act(() => {
      result.current.actions.goBackToEmail();
    });
    expect(result.current.flow.section).toBe('email');
  });

  it('navigates to login with the named action', () => {
    const { result } = renderHook(() => useNewAccountScreen());

    act(() => {
      result.current.actions.goToLogin();
    });

    expect(mockDismissTo).toHaveBeenCalledWith('/login');
  });

  it('creates an account and redirects to products on successful login', async () => {
    const { result } = renderHook(() => useNewAccountScreen());

    await act(async () => {
      await result.current.actions.createAccount();
    });

    expect(mockRegister).toHaveBeenCalledWith('newuser', 'user@example.com', 'password123');
    expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });
});
