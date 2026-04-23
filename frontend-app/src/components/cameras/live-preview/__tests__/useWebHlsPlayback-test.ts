import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useWebHlsPlayback } from '../useWebHlsPlayback';

describe('useWebHlsPlayback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));
    expect(result.current.state).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.retryKey).toBe(0);
  });

  it('markLive transitions to live and clears any error message', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));
    act(() => result.current.markError('boom'));
    expect(result.current.state).toBe('error');

    act(() => result.current.markLive());
    expect(result.current.state).toBe('live');
    expect(result.current.errorMessage).toBeNull();
  });

  it('handleFatalError schedules a retry with exponential backoff under the cap', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));

    // First failure: 3000ms backoff
    act(() => result.current.handleFatalError('blip'));
    expect(result.current.state).toBe('loading');
    expect(result.current.retryKey).toBe(0);

    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(result.current.retryKey).toBe(0);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.retryKey).toBe(1);

    // Second failure: 6000ms backoff
    act(() => result.current.handleFatalError('blip'));
    act(() => {
      jest.advanceTimersByTime(5999);
    });
    expect(result.current.retryKey).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.retryKey).toBe(2);
  });

  it('handleFatalError surfaces the error after MAX_RETRIES (5) attempts', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));

    for (let i = 0; i < 5; i += 1) {
      act(() => result.current.handleFatalError('still bad'));
      act(() => {
        jest.runOnlyPendingTimers();
      });
    }

    // Sixth failure — counter is now at MAX_RETRIES, so no further retry.
    act(() => result.current.handleFatalError('finally fatal'));
    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('finally fatal');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('retryNow resets the retry counter and re-triggers playback', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));

    // Exhaust retries.
    for (let i = 0; i < 5; i += 1) {
      act(() => result.current.handleFatalError('bad'));
      act(() => {
        jest.runOnlyPendingTimers();
      });
    }
    act(() => result.current.handleFatalError('fatal'));
    expect(result.current.state).toBe('error');
    const keyBefore = result.current.retryKey;

    act(() => result.current.retryNow());

    expect(result.current.state).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.retryKey).toBe(keyBefore + 1);

    // Counter should have been reset — another fatal schedules a retry, not error.
    act(() => result.current.handleFatalError('recoverable again'));
    expect(result.current.state).toBe('loading');
  });

  it('resetForSourceChange resets the retry counter when src changes', () => {
    let src = 'stream-a.m3u8';
    const { result, rerender } = renderHook(() => useWebHlsPlayback(src));

    // Exhaust retries on first source.
    for (let i = 0; i < 5; i += 1) {
      act(() => result.current.handleFatalError('bad'));
      act(() => {
        jest.runOnlyPendingTimers();
      });
    }

    src = 'stream-b.m3u8';
    rerender(undefined);
    act(() => result.current.resetForSourceChange());

    // Fresh source: next fatal should schedule a retry, not go to error.
    act(() => result.current.handleFatalError('first on new src'));
    expect(result.current.state).toBe('loading');
  });

  it('clears any pending retry timer on unmount', () => {
    const { result, unmount } = renderHook(() => useWebHlsPlayback('stream.m3u8'));

    act(() => result.current.handleFatalError('bad'));
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
