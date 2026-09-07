import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useElapsed } from '@/hooks/useElapsed';

describe('useElapsed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns an empty string when no start time is provided', () => {
    const { result } = renderHook(() => useElapsed(null));

    expect(result.current).toBe('');
  });

  it('formats elapsed time immediately and updates every second', () => {
    const { result } = renderHook(() => useElapsed('2026-04-21T11:58:55.000Z'));

    expect(result.current).toBe('1:05');

    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    expect(result.current).toBe('1:07');
  });

  it('resets when the start time becomes null', () => {
    const { result, rerender } = renderHook<string, { startedAt: string | null }>(
      ({ startedAt }) => useElapsed(startedAt),
      {
        initialProps: { startedAt: '2026-04-21T11:59:00.000Z' },
      },
    );

    expect(result.current).toBe('1:00');

    rerender({ startedAt: null });

    expect(result.current).toBe('');
  });

  it('clamps to 0:00 when the start time is ahead of the device clock', () => {
    // Server/device clock skew; without the clamp this renders "-1:-5".
    const { result } = renderHook(() => useElapsed('2026-04-21T12:00:05.000Z'));

    expect(result.current).toBe('0:00');
  });

  it('stops ticking while the app is backgrounded and catches up on return', () => {
    let notify: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (state: AppStateStatus) => void,
    ) => {
      notify = handler;
      return { remove };
    }) as unknown as typeof AppState.addEventListener);

    const { result, unmount } = renderHook(() => useElapsed('2026-04-21T11:59:00.000Z'));
    expect(result.current).toBe('1:00');

    act(() => notify?.('background'));
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    // Interval cleared, so the clock is frozen even though 10s of wall time passed.
    expect(result.current).toBe('1:00');

    act(() => notify?.('active'));
    expect(result.current).toBe('1:10');

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
