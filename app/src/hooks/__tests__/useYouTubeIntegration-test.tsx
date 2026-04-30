import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '@/context/auth';
import { updateUser } from '@/services/api/authentication';
import type { User } from '@/types/User';
import { useYouTubeIntegration } from '../useYouTubeIntegration';

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/api/authentication', () => ({
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
      refetch: refetch as (forceRefresh?: boolean) => Promise<void>,
      isLoading: false,
    });

    const { result } = renderHook(() => useYouTubeIntegration());

    expect(result.current.enabled).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('reports loading when auth has not produced a user yet', () => {
    mockedUseAuth.mockReturnValue({
      user: undefined,
      refetch: refetch as (forceRefresh?: boolean) => Promise<void>,
      isLoading: true,
    });

    const { result } = renderHook(() => useYouTubeIntegration());

    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it('updates the server preference and refreshes auth state', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-2',
        username: 'tester',
        preferences: { youtube_streaming_enabled: false },
      } as unknown as User,
      refetch: refetch as (forceRefresh?: boolean) => Promise<void>,
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
