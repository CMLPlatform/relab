import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useOwnProfileStats } from '@/features/profile/useOwnProfileStats';

const mockGetPublicProfile = jest.fn();

jest.mock('@/services/api/profiles', () => ({
  getPublicProfile: (...args: unknown[]) => mockGetPublicProfile(...args),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { id: 'viewer-1' }, isLoading: false, refetch: jest.fn() }),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const TESTER_STATS = {
  product_count: 3,
  image_count: 8,
  total_weight_kg: 4.5,
  top_category: 'Audio',
};
const OTHER_STATS = {
  product_count: 99,
  image_count: 1,
  total_weight_kg: 0.5,
  top_category: 'Tools',
};

describe('useOwnProfileStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicProfile.mockImplementation(async () => TESTER_STATS);
  });

  it('returns grouped state', async () => {
    const { result } = renderHook(() => useOwnProfileStats('tester'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(result.current.state.stats?.product_count).toBe(3);
    expect(result.current.state.error).toBeNull();
  });

  it('does not fetch and reports no stats without a username', () => {
    const { result } = renderHook(() => useOwnProfileStats(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.state.stats).toBeNull();
    expect(result.current.state.loading).toBe(false);
    expect(mockGetPublicProfile).not.toHaveBeenCalled();
  });

  it('refetches stats when the username changes', async () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ username }: { username: string }) => useOwnProfileStats(username),
      { initialProps: { username: 'tester' }, wrapper },
    );
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    mockGetPublicProfile.mockImplementation(async () => OTHER_STATS);
    rerender({ username: 'other' });

    await waitFor(() => expect(result.current.state.stats?.product_count).toBe(99));
    expect(mockGetPublicProfile).toHaveBeenCalledWith('tester');
    expect(mockGetPublicProfile).toHaveBeenCalledWith('other');
  });

  // Regression: the hand-rolled fetch kept the previous user's stats in state
  // while the new ones loaded, so a username change briefly rendered the wrong
  // person's product and photo counts.
  it('never surfaces the previous username’s stats after a change', async () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ username }: { username: string }) => useOwnProfileStats(username),
      { initialProps: { username: 'tester' }, wrapper },
    );
    await waitFor(() => expect(result.current.state.stats?.product_count).toBe(3));

    let release: (value: unknown) => void = () => {};
    mockGetPublicProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    rerender({ username: 'other' });

    // While 'other' is in flight, 'tester' stats must not be shown.
    expect(result.current.state.stats).toBeNull();
    expect(result.current.state.loading).toBe(true);

    release(OTHER_STATS);
    await waitFor(() => expect(result.current.state.stats?.product_count).toBe(99));
  });

  // Regression: a failed fetch was logged and swallowed, leaving stale stats on
  // screen with no error surfaced.
  it('surfaces a fetch failure instead of swallowing it', async () => {
    mockGetPublicProfile.mockImplementation(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useOwnProfileStats('tester'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.state.error).not.toBeNull());
    expect(result.current.state.stats).toBeNull();
  });
});
