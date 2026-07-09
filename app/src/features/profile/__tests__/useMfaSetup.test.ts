import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMfaSetup } from '@/features/profile/useMfaSetup';
import {
  confirmTotpSetup,
  disableTotp,
  regenerateRecoveryCodes,
  startTotpSetup,
} from '@/services/api/auth/authMfa';

jest.mock('@/services/api/auth/authMfa', () => ({
  startTotpSetup: jest.fn(),
  confirmTotpSetup: jest.fn(),
  disableTotp: jest.fn(),
  regenerateRecoveryCodes: jest.fn(),
}));

const mockStart = startTotpSetup as jest.Mock<typeof startTotpSetup>;
const mockConfirm = confirmTotpSetup as jest.Mock<typeof confirmTotpSetup>;
const mockDisable = disableTotp as jest.Mock<typeof disableTotp>;
const mockRegenerate = regenerateRecoveryCodes as jest.Mock<typeof regenerateRecoveryCodes>;

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];

const SETUP = { setupToken: 'tok', secret: 'ABCD', otpauthUri: 'otpauth://x' };

afterEach(() => {
  jest.clearAllMocks();
});

describe('useMfaSetup enroll', () => {
  it('opens the enroll dialog with setup material after start', async () => {
    mockStart.mockResolvedValue(SETUP);
    const { result } = renderHook(() => useMfaSetup(jest.fn()));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.mode).toBe('enroll');
    expect(result.current.setup).toEqual(SETUP);
  });

  it('strips non-digits and caps the code at 6', () => {
    const { result } = renderHook(() => useMfaSetup(jest.fn()));
    act(() => result.current.setCode('12ab34567'));
    expect(result.current.code).toBe('123456');
  });

  it('does not submit until a password is entered', async () => {
    mockStart.mockResolvedValue(SETUP);
    const { result } = renderHook(() => useMfaSetup(jest.fn()));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.setCode('123456'));
    expect(result.current.canSubmit).toBe(false);
    await act(async () => {
      await result.current.confirm('123456');
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('auto-submits code + password, then shows recovery codes', async () => {
    mockStart.mockResolvedValue(SETUP);
    mockConfirm.mockResolvedValue(CODES);
    const onChange = jest.fn();
    const { result } = renderHook(() => useMfaSetup(onChange));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.setPassword('pw'));
    await act(async () => {
      await result.current.confirm('123456');
    });

    expect(mockConfirm).toHaveBeenCalledWith('tok', '123456', 'pw');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe('codes');
    expect(result.current.recoveryCodes).toEqual(CODES);
  });

  it('surfaces an error and stays open on a bad code', async () => {
    mockStart.mockResolvedValue(SETUP);
    mockConfirm.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useMfaSetup(jest.fn()));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.setPassword('pw'));
    await act(async () => {
      await result.current.confirm('000000');
    });

    await waitFor(() => expect(result.current.error).toBe('nope'));
    expect(result.current.mode).toBe('enroll');
  });
});

describe('useMfaSetup disable', () => {
  it('turns off MFA and closes', async () => {
    mockDisable.mockResolvedValue(undefined);
    const onChange = jest.fn();
    const { result } = renderHook(() => useMfaSetup(onChange));

    act(() => result.current.beginDisable(false));
    expect(result.current.mode).toBe('disable');

    await act(async () => {
      await result.current.disable('123456');
    });

    expect(mockDisable).toHaveBeenCalledWith('123456');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe('idle');
  });

  it('reset chains disable into a fresh enrollment', async () => {
    mockDisable.mockResolvedValue(undefined);
    mockStart.mockResolvedValue(SETUP);
    const { result } = renderHook(() => useMfaSetup(jest.fn()));

    act(() => result.current.beginDisable(true));
    await act(async () => {
      await result.current.disable('123456');
    });

    expect(mockDisable).toHaveBeenCalledWith('123456');
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe('enroll');
    expect(result.current.setup).toEqual(SETUP);
  });
});

describe('useMfaSetup regenerate', () => {
  it('reissues recovery codes after a current code and shows them', async () => {
    mockRegenerate.mockResolvedValue(CODES);
    const { result } = renderHook(() => useMfaSetup(jest.fn()));

    act(() => result.current.beginRegenerate());
    expect(result.current.mode).toBe('regenerate');

    await act(async () => {
      await result.current.regenerate('123456');
    });

    expect(mockRegenerate).toHaveBeenCalledWith('123456');
    expect(result.current.mode).toBe('codes');
    expect(result.current.recoveryCodes).toEqual(CODES);
  });
});

describe('useMfaSetup guards', () => {
  // Regression: the `busy` single-flight guard had zero coverage. A double tap
  // must not submit the same single-use TOTP code twice.
  it('ignores a second confirm while the first is in flight', async () => {
    mockStart.mockResolvedValue(SETUP);
    let release: (value: string[]) => void = () => {};
    mockConfirm.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          release = resolve;
        }),
    );

    const { result } = renderHook(() => useMfaSetup(jest.fn()));
    await act(async () => await result.current.start());
    act(() => result.current.setPassword('pw'));
    act(() => result.current.setCode('123456'));

    await act(async () => {
      void result.current.confirm();
      void result.current.confirm();
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(CODES);
      await Promise.resolve();
    });
  });

  it('ignores a second disable while the first is in flight', async () => {
    let release: () => void = () => {};
    mockDisable.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const { result } = renderHook(() => useMfaSetup(jest.fn()));
    act(() => result.current.beginDisable(false));
    act(() => result.current.setCode('123456'));

    await act(async () => {
      void result.current.disable();
      void result.current.disable();
      await Promise.resolve();
    });

    expect(mockDisable).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await Promise.resolve();
    });
  });

  // Regression: the shared secret was held through the recovery-codes screen.
  it('drops the TOTP secret as soon as enrollment is confirmed', async () => {
    mockStart.mockResolvedValue(SETUP);
    mockConfirm.mockResolvedValue(CODES);

    const { result } = renderHook(() => useMfaSetup(jest.fn()));
    await act(async () => await result.current.start());
    expect(result.current.setup).not.toBeNull();

    act(() => result.current.setPassword('pw'));
    await act(async () => await result.current.confirm('123456'));

    expect(result.current.mode).toBe('codes');
    expect(result.current.setup).toBeNull();
    expect(result.current.recoveryCodes).toEqual(CODES);
  });

  // Regression: reset() clearing the one-time recovery codes was never driven.
  it('clears the recovery codes when the dialog is closed', async () => {
    mockStart.mockResolvedValue(SETUP);
    mockConfirm.mockResolvedValue(CODES);

    const { result } = renderHook(() => useMfaSetup(jest.fn()));
    await act(async () => await result.current.start());
    act(() => result.current.setPassword('pw'));
    await act(async () => await result.current.confirm('123456'));
    expect(result.current.recoveryCodes).toEqual(CODES);

    act(() => result.current.cancel());

    expect(result.current.recoveryCodes).toBeNull();
    expect(result.current.setup).toBeNull();
    expect(result.current.mode).toBe('idle');
  });

  // Regression: a refetch failure after disableTotp already succeeded was
  // reported as "That code didn't match", stranding the dialog against a server
  // that had already turned MFA off.
  it('does not blame the code when the post-disable refetch fails', async () => {
    mockDisable.mockResolvedValue(undefined);
    const onChange = jest.fn(() => {
      throw new Error('network down');
    });

    const { result } = renderHook(() => useMfaSetup(onChange));
    act(() => result.current.beginDisable(false));

    await act(async () => await result.current.disable('123456'));

    expect(mockDisable).toHaveBeenCalledWith('123456');
    expect(result.current.error).toBeNull();
    expect(result.current.mode).toBe('idle');
  });
});
