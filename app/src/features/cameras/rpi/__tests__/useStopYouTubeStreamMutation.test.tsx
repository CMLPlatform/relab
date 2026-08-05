import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { useStopYouTubeStreamMutation } from '@/features/cameras/rpi/hooks';
import { stopYouTubeStream } from '@/services/api/rpiCamera';

jest.mock('@/services/api/rpiCamera', () => ({
  stopYouTubeStream: jest.fn(),
  buildCameraHlsUrl: (id: string) => `/api/rpi-cameras/${id}/hls/cam-preview/index.m3u8`,
}));

const mockedStopYouTubeStream = jest.mocked(stopYouTubeStream);

const CAMERA_ID = 'cam-1';
const STREAM_STATUS_KEY = ['rpiCameraStreamStatus', CAMERA_ID];
const LIVE_STREAM = { status: 'live', videoId: 'yt-123' };

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      // gcTime must not be 0 here: these assertions read the cache after the
      // mutation settles, and immediate garbage collection would evict the very
      // entry the optimistic update and rollback act on.
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
});

// This is the only mutation in the app with real optimistic-update and rollback
// wiring, and every consumer test mocks the hook away — so the wiring itself had
// never run. These drive it directly.
describe('useStopYouTubeStreamMutation', () => {
  it('clears the stream status optimistically before the request resolves', async () => {
    queryClient.setQueryData(STREAM_STATUS_KEY, LIVE_STREAM);
    mockedStopYouTubeStream.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStopYouTubeStreamMutation(CAMERA_ID), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // onMutate blanks the cached status so the UI stops showing "live" the moment
    // the user asks to stop, rather than after the round trip.
    expect(queryClient.getQueryData(STREAM_STATUS_KEY)).toBeNull();
  });

  it('restores the previous stream status when stopping fails', async () => {
    queryClient.setQueryData(STREAM_STATUS_KEY, LIVE_STREAM);
    mockedStopYouTubeStream.mockRejectedValue(new Error('relay unreachable'));

    const { result } = renderHook(() => useStopYouTubeStreamMutation(CAMERA_ID), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Without the rollback the card would claim the stream is stopped while it is
    // still broadcasting — the one state a viewer must never be shown.
    expect(queryClient.getQueryData(STREAM_STATUS_KEY)).toEqual(LIVE_STREAM);
  });
});
