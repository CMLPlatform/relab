import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCpvType } from '@/features/products/useCpvType';
import { loadCPV } from '@/services/cpv';

jest.mock('@/services/cpv', () => ({ loadCPV: jest.fn() }));

const cat = { id: 5, name: 'Plastics', description: 'd' };
const mockLoad = loadCPV as jest.Mock<typeof loadCPV>;

describe('useCpvType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns idle without loading when there is no type id', async () => {
    const { result } = await renderHook(() => useCpvType(undefined));
    expect(result.current.status).toBe('idle');
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('skips loading when the recorded type matches the id', async () => {
    const { result } = await renderHook(() => useCpvType(5, cat));
    expect(result.current).toEqual({
      status: 'ready',
      type: { name: 'Plastics', description: 'd' },
    });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('loads and selects the type by id', async () => {
    mockLoad.mockResolvedValue({ '5': cat } as never);
    const { result } = await renderHook(() => useCpvType(5));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ type: cat });
  });

  it('reports an error with a working retry instead of staying silent', async () => {
    mockLoad.mockRejectedValueOnce(new Error('chunk failed'));
    const { result } = await renderHook(() => useCpvType(5));
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockLoad.mockResolvedValueOnce({ '5': cat } as never);
    await act(async () => {
      if (result.current.status === 'error') result.current.retry?.();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('has no retry when the id is absent from the dataset', async () => {
    mockLoad.mockResolvedValue({} as never);
    const { result } = await renderHook(() => useCpvType(9));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toEqual({ status: 'error' });
  });
});
