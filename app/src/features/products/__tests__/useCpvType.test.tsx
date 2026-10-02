import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { useCpvType } from '@/features/products/useCpvType';
import { loadCPV } from '@/services/cpv';

jest.mock('@/services/cpv', () => ({ loadCPV: jest.fn() }));

const cat = { id: 5, name: 'Plastics', description: 'd' };
const mockLoad = loadCPV as jest.Mock<typeof loadCPV>;

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCpvType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client = new QueryClient();
  });

  it('returns idle without loading when there is no type id', async () => {
    const { result } = await renderHook(() => useCpvType(undefined), { wrapper });
    expect(result.current.status).toBe('idle');
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('skips loading when the recorded type matches the id', async () => {
    const { result } = await renderHook(() => useCpvType(5, cat), { wrapper });
    expect(result.current).toEqual({
      status: 'ready',
      type: { name: 'Plastics', description: 'd' },
    });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('loads and selects the type by id', async () => {
    mockLoad.mockResolvedValue({ '5': cat } as never);
    const { result } = await renderHook(() => useCpvType(5), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ type: cat });
  });

  it('reports an error with a working retry instead of staying silent', async () => {
    mockLoad.mockRejectedValueOnce(new Error('chunk failed'));
    const { result } = await renderHook(() => useCpvType(5), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockLoad.mockResolvedValueOnce({ '5': cat } as never);
    await act(async () => {
      if (result.current.status === 'error') result.current.retry?.();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('has no retry when the id is absent from the dataset', async () => {
    mockLoad.mockResolvedValue({} as never);
    const { result } = await renderHook(() => useCpvType(9), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toEqual({ status: 'error' });
  });
});
