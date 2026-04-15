import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useWebHlsPlayback } from '@/components/cameras/live-preview/useWebHlsPlayback';

describe('useWebHlsPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in loading state and exposes retry controls', () => {
    const { result } = renderHook(() => useWebHlsPlayback('https://cam/live.m3u8'));

    expect(result.current.state).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
    expect(typeof result.current.retryNow).toBe('function');
  });

  it('marks the preview as live', () => {
    const { result } = renderHook(() => useWebHlsPlayback('https://cam/live.m3u8'));

    act(() => {
      result.current.markLive();
    });

    expect(result.current.state).toBe('live');
    expect(result.current.errorMessage).toBeNull();
  });

  it('marks an unrecoverable preview error', () => {
    const { result } = renderHook(() => useWebHlsPlayback('https://cam/live.m3u8'));

    act(() => {
      result.current.markError('Playback failed');
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('Playback failed');
  });

  it('resets back to loading when retry is requested', () => {
    const { result } = renderHook(() => useWebHlsPlayback('https://cam/live.m3u8'));

    act(() => {
      result.current.markError('Playback failed');
      result.current.retryNow();
    });

    expect(result.current.state).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.retryKey).toBe(1);
  });
});
