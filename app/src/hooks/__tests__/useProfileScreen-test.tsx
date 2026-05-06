import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type React from 'react';
import { useProfileScreen } from '@/hooks/profile/useProfileScreen';

const mockReplace: jest.Mock = jest.fn();
const mockRefetch: jest.Mock = jest.fn();
const mockSetActiveStream: jest.Mock = jest.fn();
const mockFeedback = {
  alert: jest.fn(),
  error: jest.fn(),
  toast: jest.fn(),
};
const mockSetRpiEnabled: jest.Mock = jest.fn();
const mockSetYoutubeEnabled: jest.Mock = jest.fn();
const mockSetThemeMode: jest.Mock = jest.fn();
const mockVerify: jest.Mock = jest.fn();
const mockUpdateUser: jest.Mock = jest.fn();
const mockLogout: jest.Mock = jest.fn();
const mockRevokeAllSessions: jest.Mock = jest.fn();
const mockStopStreamMutate: jest.Mock = jest.fn();
const mockProfile = {
  id: 'user-1',
  username: 'tester',
  email: 'tester@example.com',
  preferences: {},
  oauth_accounts: [],
};
const mockAuthState = {
  user: mockProfile,
  refetch: mockRefetch,
};
const mockThemeModeState = {
  themeMode: 'auto',
  setThemeMode: mockSetThemeMode,
};
const mockStreamSessionState = {
  activeStream: { productId: 42, productName: 'Desk Radio' },
  setActiveStream: mockSetActiveStream,
};
const mockRpiIntegrationState = {
  enabled: true,
  loading: false,
  setEnabled: mockSetRpiEnabled,
};
const mockYoutubeIntegrationState = {
  enabled: true,
  loading: false,
  setEnabled: mockSetYoutubeEnabled,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/context/streamSession', () => ({
  useStreamSession: () => mockStreamSessionState,
}));

jest.mock('@/context/themeMode', () => ({
  useThemeMode: () => mockThemeModeState,
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => mockFeedback,
}));

jest.mock('@/hooks/useRpiIntegration', () => ({
  useRpiIntegration: () => mockRpiIntegrationState,
}));

jest.mock('@/hooks/useYouTubeIntegration', () => ({
  useYouTubeIntegration: () => mockYoutubeIntegrationState,
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useStopYouTubeStreamMutation: () => ({
    mutate: (...args: unknown[]) => mockStopStreamMutate(...args),
    isPending: false,
  }),
}));

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
  logout: (...args: unknown[]) => mockLogout(...args),
  revokeAllSessions: (...args: unknown[]) => mockRevokeAllSessions(...args),
  unlinkOAuth: jest.fn(),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  verify: (...args: unknown[]) => mockVerify(...args),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/services/api/profiles', () => ({
  getPublicProfile: jest.fn(async () => ({
    product_count: 1,
    image_count: 2,
    total_weight_kg: 3,
    top_category: 'Phones',
  })),
}));

describe('useProfileScreen', () => {
  function Wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockImplementation(async () => true);
    mockUpdateUser.mockImplementation(async () => undefined);
    mockLogout.mockImplementation(async () => undefined);
    mockRevokeAllSessions.mockImplementation(async () => undefined);
    mockStopStreamMutate.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { onSuccess?: () => void } | undefined;
      options?.onSuccess?.();
    });
  });

  it('shows a toast when verification email is sent successfully', async () => {
    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      result.current.actions.onVerifyAccount();
      await Promise.resolve();
    });

    expect(mockVerify).toHaveBeenCalledWith('tester@example.com');
    expect(mockFeedback.toast).toHaveBeenCalledWith(
      'Verification email sent. Please check your inbox.',
    );
  });

  it('updates the recurring email preference and refetches the profile', async () => {
    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.profile.handleEmailUpdatesChange(true);
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({
      preferences: { email_updates_enabled: true },
    });
    expect(mockRefetch).toHaveBeenCalledWith(false);
    expect(mockFeedback.toast).toHaveBeenCalledWith('Email updates enabled.');
  });

  it('rejects too-short usernames before calling updateUser', async () => {
    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      result.current.dialogs.editUsername.setValue('a');
    });

    await act(async () => {
      await result.current.actions.handleUpdateUsername();
    });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Username must be at least 2 characters.',
      'Invalid username',
    );
  });

  it('logs out, clears the active stream, refetches auth, and redirects', async () => {
    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      result.current.dialogs.logoutDialog.open();
      result.current.actions.confirmLogout();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSetActiveStream).toHaveBeenCalledWith(null);
    expect(mockLogout).toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('shows an error and aborts logout when stopping the active stream fails', async () => {
    mockStopStreamMutate.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { onError?: (error: unknown) => void } | undefined;
      options?.onError?.(new Error('stop failed'));
    });

    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      result.current.actions.confirmLogout();
      await Promise.resolve();
    });

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSetActiveStream).not.toHaveBeenCalledWith(null);
    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Failed to stop the stream. Please stop it manually before logging out.',
      'Stream error',
    );
  });

  it('stops an active stream before signing out everywhere', async () => {
    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      result.current.actions.onRevokeAllSessions();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStopStreamMutate).toHaveBeenCalled();
    expect(mockSetActiveStream).toHaveBeenCalledWith(null);
    expect(mockRevokeAllSessions).toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('aborts sign out everywhere when stopping the active stream fails', async () => {
    mockStopStreamMutate.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { onError?: (error: unknown) => void } | undefined;
      options?.onError?.(new Error('stop failed'));
    });

    const { result } = renderHook(() => useProfileScreen(), { wrapper: Wrapper });

    await act(async () => {
      result.current.actions.onRevokeAllSessions();
      await Promise.resolve();
    });

    expect(mockRevokeAllSessions).not.toHaveBeenCalled();
    expect(mockSetActiveStream).not.toHaveBeenCalledWith(null);
    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Failed to stop the stream. Please stop it manually before logging out.',
      'Stream error',
    );
  });
});
