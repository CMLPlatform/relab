import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useLoginForm } from '@/features/auth/useLoginForm';

const mockLogin = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/services/api/auth/authentication', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  getUser: (...args: unknown[]) => mockGetUser(...args),
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: { field: 'control' },
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

    const { result } = renderHook(() => useLoginForm(makeArgs()));

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
});
