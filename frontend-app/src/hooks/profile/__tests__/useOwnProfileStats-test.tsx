import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useOwnProfileStats } from '@/hooks/profile/useOwnProfileStats';

const mockGetPublicProfile = jest.fn();

jest.mock('@/services/api/profiles', () => ({
  getPublicProfile: (...args: unknown[]) => mockGetPublicProfile(...args),
}));

jest.mock('@/utils/logging', () => ({
  logError: jest.fn(),
}));

describe('useOwnProfileStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicProfile.mockImplementation(async () => ({
      product_count: 3,
      image_count: 8,
      total_weight_kg: 4.5,
      top_category: 'Audio',
    }));
  });

  it('returns grouped state and actions', async () => {
    const { result } = renderHook(() => useOwnProfileStats('tester'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.stats?.product_count).toBe(3);
    expect(result.current.state.loading).toBe(false);
    expect(typeof result.current.actions.reload).toBe('function');
  });

  it('reloads stats through the named action', async () => {
    const { result } = renderHook(() => useOwnProfileStats('tester'));

    await act(async () => {
      await Promise.resolve();
      await result.current.actions.reload();
    });

    expect(mockGetPublicProfile).toHaveBeenCalledWith('tester');
    expect(mockGetPublicProfile).toHaveBeenCalledTimes(2);
  });
});
