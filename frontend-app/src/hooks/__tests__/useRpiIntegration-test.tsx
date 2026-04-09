import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '@/context/AuthProvider';
import { updateUser } from '@/services/api/authentication';
import { useRpiIntegration } from '../useRpiIntegration';

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn(),
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedUpdateUser = jest.mocked(updateUser);

describe('useRpiIntegration', () => {
  const refetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reflects the stored preference and loading state', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        username: 'tester',
        preferences: { rpi_camera_enabled: true },
      },
      refetch,
      isLoading: false,
    });

    const { result } = renderHook(() => useRpiIntegration());

    expect(result.current.enabled).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('updates the server preference and refreshes auth state', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-2',
        username: 'tester',
        preferences: { rpi_camera_enabled: false },
      },
      refetch,
      isLoading: false,
    });
    mockedUpdateUser.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRpiIntegration());

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(mockedUpdateUser).toHaveBeenCalledWith({
      preferences: { rpi_camera_enabled: true },
    });
    expect(refetch).toHaveBeenCalledWith(false);
  });
});
