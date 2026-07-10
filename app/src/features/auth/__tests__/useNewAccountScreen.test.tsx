import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useNewAccountScreen } from '@/features/auth/useNewAccountScreen';

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

jest.mock('@/components/base/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
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

jest.mock('@/services/api/auth/authentication', () => ({
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
          password: 'correct-horse-battery-staple-v42',
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

    expect(mockRegister).toHaveBeenCalledWith(
      'newuser',
      'user@example.com',
      'correct-horse-battery-staple-v42',
    );
    expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'correct-horse-battery-staple-v42');
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  // Regression: the button only shows a spinner while submitting (it stays
  // pressable), so a double-tap fired register twice — the second returned
  // "email exists" and popped a spurious "Registration Failed" dialog over the
  // successful signup. The ref guard must single-flight it.
  it('ignores a second createAccount while the first is in flight', async () => {
    let release: () => void = () => {};
    mockRegister.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ success: true });
        }),
    );

    const { result } = renderHook(() => useNewAccountScreen());

    await act(async () => {
      void result.current.actions.createAccount();
      void result.current.actions.createAccount();
      await Promise.resolve();
    });

    expect(mockRegister).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
  });
});
