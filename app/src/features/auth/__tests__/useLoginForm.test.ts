import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useLoginForm } from '@/features/auth/useLoginForm';

const mockLogin = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/services/api/auth/authLogin', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
}));
jest.mock('@/services/api/auth/authUser', () => ({
  getUser: (...args: unknown[]) => mockGetUser(...args),
}));

const mockSetError = jest.fn();

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: { field: 'control' },
    setError: (...args: unknown[]) => mockSetError(...args),
    handleSubmit: (handler: (values: { email: string; password: string }) => Promise<void>) => () =>
      handler({ email: 'user@example.com', password: 'correct-horse-battery-staple' }),
  }),
}));

jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => jest.fn() }));

function makeArgs() {
  return {
    dialog: { alert: jest.fn() },
    completeSuccessfulLogin: jest.fn(async () => {}),
    handleMfaPending: jest.fn(),
  } as unknown as Parameters<typeof useLoginForm>[0];
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('useLoginForm guards', () => {
  // Regression: the login button stays pressable during submit and the password
  // field's onSubmitEditing fires the same handler, so two submits could race
  // before any re-render. Without a ref guard, an mfa_required response stacks
  // two /mfa screens and a success navigates twice.
  it('ignores a second submit while the first login is in flight', async () => {
    let release: () => void = () => {};
    mockLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'mfa_required', mfaToken: 'tok' });
        }),
    );

    const { result } = await renderHook(() => useLoginForm(makeArgs()));

    await act(async () => {
      void result.current.submit();
      void result.current.submit();
      await Promise.resolve();
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
  });

  // Focusing in the same tick as setError lands before the error text and its
  // aria-describedby link commit, so the field is announced without the error.
  it('focuses the password field a frame after flagging a wrong password', async () => {
    mockLogin.mockImplementation(async () => ({ status: 'invalid_credentials' }));
    const { result } = await renderHook(() => useLoginForm(makeArgs()));
    const focus = jest.fn();
    result.current.passwordRef.current = { focus };

    await act(async () => {
      await result.current.submit();
    });

    expect(mockSetError).toHaveBeenCalledWith('password', expect.anything());
    expect(focus).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(32);
    });
    expect(focus).toHaveBeenCalled();
  });
});
