import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useSingleFlight } from '@/hooks/useSingleFlight';

describe('useSingleFlight', () => {
  it('ignores calls made while the action is still running, then allows the next one', async () => {
    let release: () => void = () => {};
    const action = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));

    const { result } = renderHook(() => useSingleFlight(action));

    await act(async () => {
      void result.current();
      void result.current();
    });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
    await act(async () => {
      void result.current();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('releases the guard when the action rejects', async () => {
    const action = jest.fn(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useSingleFlight(action));

    await act(async () => {
      await expect(result.current()).rejects.toThrow('boom');
    });
    await act(async () => {
      await expect(result.current()).rejects.toThrow('boom');
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('forwards arguments to the wrapped action', async () => {
    const action = jest.fn(async (_code: string) => undefined);

    const { result } = renderHook(() => useSingleFlight(action));

    await act(async () => {
      await result.current('123456');
    });
    expect(action).toHaveBeenCalledWith('123456');
  });
});
