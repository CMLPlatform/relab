import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useElapsed } from '@/hooks/useElapsed';

describe('useElapsed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
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
});
