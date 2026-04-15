import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useProfileScreen } from '@/hooks/useProfileScreen';

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

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/context/StreamSessionContext', () => ({
  useStreamSession: () => mockStreamSessionState,
}));

jest.mock('@/context/ThemeModeProvider', () => ({
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

jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
  logout: (...args: unknown[]) => mockLogout(...args),
  unlinkOAuth: jest.fn(),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  verify: (...args: unknown[]) => mockVerify(...args),
}));

jest.mock('@/services/api/client', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/services/api/newsletter', () => ({
  getNewsletterPreference: jest.fn(async () => ({ subscribed: false })),
  setNewsletterPreference: jest.fn(async () => ({ subscribed: true })),
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockImplementation(async () => true);
    mockUpdateUser.mockImplementation(async () => undefined);
    mockLogout.mockImplementation(async () => undefined);
  });

  it('shows a toast when verification email is sent successfully', async () => {
    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      result.current.onVerifyAccount();
      await Promise.resolve();
    });

    expect(mockVerify).toHaveBeenCalledWith('tester@example.com');
    expect(mockFeedback.toast).toHaveBeenCalledWith(
      'Verification email sent. Please check your inbox.',
    );
  });

  it('rejects too-short usernames before calling updateUser', async () => {
    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      result.current.setNewUsername('a');
    });

    await act(async () => {
      await result.current.handleUpdateUsername();
    });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Username must be at least 2 characters.',
      'Invalid username',
    );
  });

  it('logs out, clears the active stream, refetches auth, and redirects', async () => {
    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      result.current.setLogoutDialogVisible(true);
      result.current.confirmLogout();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSetActiveStream).toHaveBeenCalledWith(null);
    expect(mockLogout).toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });
});
