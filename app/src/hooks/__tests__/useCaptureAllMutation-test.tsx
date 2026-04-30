import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type React from 'react';
import type { CaptureAllResult } from '../useRpiCameras';

jest.mock('@/services/api/rpiCamera', () => ({
  captureImageFromCamera: jest.fn(),
}));

// Imports that depend on the mock above MUST come after the jest.mock call.
import { captureImageFromCamera } from '@/services/api/rpiCamera';
import { useCaptureAllMutation } from '../useRpiCameras';

const mockedCapture = jest.mocked(captureImageFromCamera);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    {children}
  </QueryClientProvider>
);

const fakeCapture = (id: string) => ({
  id,
  url: `https://cdn.example.com/${id}.jpg`,
  thumbnailUrl: null,
  description: '',
});

describe('useCaptureAllMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires one capture per camera id in parallel and reports succeeded/failed', async () => {
    mockedCapture
      .mockResolvedValueOnce(fakeCapture('img-1'))
      .mockResolvedValueOnce(fakeCapture('img-2'))
      .mockRejectedValueOnce(new Error('camera-3 offline'));

    const { result } = renderHook(() => useCaptureAllMutation(), { wrapper });

    let summary: CaptureAllResult | undefined;
    await act(async () => {
      summary = await result.current.mutateAsync({
        cameraIds: ['cam-1', 'cam-2', 'cam-3'],
        productId: 42,
      });
    });

    expect(mockedCapture).toHaveBeenCalledTimes(3);
    expect(mockedCapture).toHaveBeenCalledWith('cam-1', 42);
    expect(mockedCapture).toHaveBeenCalledWith('cam-2', 42);
    expect(mockedCapture).toHaveBeenCalledWith('cam-3', 42);

    expect(summary).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
      errors: [{ cameraId: 'cam-3', error: expect.any(Error) }],
    });
    expect(summary?.errors[0]?.error.message).toBe('camera-3 offline');
  });

  it('returns a 0/0 summary for an empty camera list', async () => {
    const { result } = renderHook(() => useCaptureAllMutation(), { wrapper });

    let summary: CaptureAllResult | undefined;
    await act(async () => {
      summary = await result.current.mutateAsync({ cameraIds: [], productId: 1 });
    });

    expect(mockedCapture).not.toHaveBeenCalled();
    expect(summary).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    });
  });

  it('wraps a non-Error rejection in a real Error', async () => {
    mockedCapture.mockRejectedValueOnce('string reason');

    const { result } = renderHook(() => useCaptureAllMutation(), { wrapper });

    let summary: CaptureAllResult | undefined;
    await act(async () => {
      summary = await result.current.mutateAsync({ cameraIds: ['cam-err'], productId: 7 });
    });

    expect(summary?.failed).toBe(1);
    expect(summary?.errors[0]?.error).toBeInstanceOf(Error);
    expect(summary?.errors[0]?.error.message).toBe('string reason');
  });
});
