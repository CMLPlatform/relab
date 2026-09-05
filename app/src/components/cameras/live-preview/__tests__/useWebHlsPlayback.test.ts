import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useWebHlsPlayback } from '@/components/cameras/live-preview/useWebHlsPlayback';

describe('useWebHlsPlayback', () => {
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

  it('markError surfaces the message on the retry overlay', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));

    act(() => result.current.markError('bufferStalledError'));

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('bufferStalledError');
  });

  it('retryNow clears the error and bumps retryKey to force a re-attach', () => {
    const { result } = renderHook(() => useWebHlsPlayback('stream.m3u8'));
    act(() => result.current.markError('fatal'));

    act(() => result.current.retryNow());

    expect(result.current.state).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.retryKey).toBe(1);
  });

  it('resets to loading when the source changes, without bumping retryKey', () => {
    let src = 'stream-a.m3u8';
    const { result, rerender } = renderHook(() => useWebHlsPlayback(src));
    act(() => result.current.markError('bad'));
    expect(result.current.state).toBe('error');

    src = 'stream-b.m3u8';
    rerender(undefined);

    expect(result.current.state).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
    // The src change already re-runs the setup effect; no retry bump needed.
    expect(result.current.retryKey).toBe(0);
  });
});
