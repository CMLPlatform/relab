import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '@/context/auth';
import { useYouTubeIntegration } from '@/features/cameras/youtube/useYouTubeIntegration';
import { updateUser } from '@/services/api/auth/authentication';
import type { User } from '@/types/User';

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/api/auth/authentication', () => ({
  updateUser: jest.fn(),
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedUpdateUser = jest.mocked(updateUser);

describe('useYouTubeIntegration', () => {
  const refetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reflects the stored preference and loading state', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        username: 'tester',
        preferences: { youtube_streaming_enabled: true },
      } as unknown as User,
      refetch: refetch as (forceRefresh?: boolean) => Promise<undefined>,
      isLoading: false,
    });

    const { result } = renderHook(() => useYouTubeIntegration());

    expect(result.current.enabled).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('reports loading when auth has not produced a user yet', () => {
    mockedUseAuth.mockReturnValue({
      user: undefined,
      refetch: refetch as (forceRefresh?: boolean) => Promise<undefined>,
      isLoading: true,
    });

    const { result } = renderHook(() => useYouTubeIntegration());

    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  // Regression: `loading` must track auth's isLoading, not `!user` — a settled
  // guest has no user and must not be reported as still loading.
  it('is not loading once auth settles without a user', () => {
    mockedUseAuth.mockReturnValue({
      user: undefined,
      refetch: refetch as (forceRefresh?: boolean) => Promise<undefined>,
      isLoading: false,
    });

    const { result } = renderHook(() => useYouTubeIntegration());

    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('updates the server preference and refreshes auth state', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-2',
        username: 'tester',
        preferences: { youtube_streaming_enabled: false },
      } as unknown as User,
      refetch: refetch as (forceRefresh?: boolean) => Promise<undefined>,
      isLoading: false,
    });
    mockedUpdateUser.mockResolvedValue(undefined);

    const { result } = renderHook(() => useYouTubeIntegration());

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(mockedUpdateUser).toHaveBeenCalledWith({
      preferences: { youtube_streaming_enabled: true },
    });
    expect(refetch).toHaveBeenCalledWith(false);
  });
});
