import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { createURL } from 'expo-linking';
import { useOAuthAssociations } from '@/features/profile/useOAuthAssociations';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  isAllowedOAuthRedirectUrl,
  isExpectedOAuthCallbackUrl,
  openOAuthBrowserSession,
} from '@/services/api/oauthFlow';

const mockFeedback = {
  error: jest.fn(),
};
const mockRefetch = jest.fn<(forceRefresh?: boolean) => Promise<unknown>>();
const mockSetYoutubeEnabled = jest.fn<(enabled: boolean) => Promise<void>>();

jest.mock('expo-linking', () => ({
  __esModule: true,
  createURL: jest.fn(() => 'relab-app://account'),
}));

jest.mock('@/services/api/oauthFlow', () => ({
  __esModule: true,
  buildOAuthAuthorizeUrl: jest.fn((path: string) => path),
  fetchOAuthAuthorizationUrl: jest.fn(async () => ({
    ok: true,
    authorizationUrl: 'https://oauth.example.com/start',
  })),
  isAllowedOAuthRedirectUrl: jest.fn(() => true),
  isExpectedOAuthCallbackUrl: jest.fn(() => true),
  openOAuthBrowserSession: jest.fn(async () => ({
    type: 'success',
    url: 'relab-app://account#status=success',
  })),
  parseOAuthCallbackUrl: jest.fn((url: string) =>
    url.includes('status=success')
      ? { status: 'success' }
      : { status: 'error', error: 'access_denied' },
  ),
}));

describe('useOAuthAssociations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createURL).mockReturnValue('relab-app://account');
    jest.mocked(buildOAuthAuthorizeUrl).mockImplementation((path) => path);
    jest.mocked(fetchOAuthAuthorizationUrl).mockImplementation(async () => ({
      ok: true,
      status: 200,
      detail: undefined,
      authorizationUrl: 'https://oauth.example.com/start',
    }));
    jest.mocked(isAllowedOAuthRedirectUrl).mockReturnValue(true);
    jest.mocked(isExpectedOAuthCallbackUrl).mockReturnValue(true);
    jest.mocked(openOAuthBrowserSession).mockImplementation(async () => ({
      type: 'success',
      url: 'relab-app://account#status=success',
    }));
    mockRefetch.mockImplementation(async () => undefined);
    mockSetYoutubeEnabled.mockImplementation(async () => undefined);
  });

  it('returns grouped youtube state and named provider link actions', () => {
    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    expect(result.current.youtube.authPending).toBe(false);
    expect(typeof result.current.youtube.toggle).toBe('function');
    expect(typeof result.current.actions.linkOAuth).toBe('function');
    expect(typeof result.current.actions.linkOAuth).toBe('function');
    expect(typeof result.current.actions.linkOAuth).toBe('function');
  });

  it('enables YouTube and refetches on successful YouTube authorization', async () => {
    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.youtube.toggle(true);
    });

    expect(mockSetYoutubeEnabled).toHaveBeenCalledWith(true);
    expect(mockRefetch).toHaveBeenCalledWith(false);
    expect(result.current.youtube.authPending).toBe(false);
  });

  it('disables YouTube immediately when toggled off', async () => {
    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.youtube.toggle(false);
    });

    expect(mockSetYoutubeEnabled).toHaveBeenCalledWith(false);
    expect(fetchOAuthAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('shows a YouTube-specific error when authorization returns a denied callback', async () => {
    jest.mocked(openOAuthBrowserSession).mockImplementation(async () => ({
      type: 'success',
      url: 'relab-app://account#status=error&error=access_denied',
    }));

    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.youtube.toggle(true);
    });

    expect(mockFeedback.error).toHaveBeenCalledWith(
      'access_denied',
      'YouTube authorization failed',
    );
    expect(mockSetYoutubeEnabled).not.toHaveBeenCalledWith(true);
  });

  it('refetches after linking Google successfully', async () => {
    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.actions.linkOAuth('google');
    });

    expect(fetchOAuthAuthorizationUrl).toHaveBeenCalledWith(
      expect.stringContaining('/oauth/google/associate/authorize'),
    );
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows an error when starting a link flow fails', async () => {
    jest.mocked(fetchOAuthAuthorizationUrl).mockImplementation(async () => ({
      ok: false,
      status: 500,
      authorizationUrl: undefined,
      detail: 'Association endpoint unavailable',
    }));

    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.actions.linkOAuth('github');
    });

    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Failed to start link flow: Association endpoint unavailable',
      'Link failed',
    );
  });

  it('rejects an unexpected provider authorization URL before opening the browser', async () => {
    jest.mocked(isAllowedOAuthRedirectUrl).mockReturnValue(false);

    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.actions.linkOAuth('github');
    });

    expect(openOAuthBrowserSession).not.toHaveBeenCalled();
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Failed to start link flow: Unexpected authorization URL received. Please try again.',
      'Link failed',
    );
  });

  it('rejects an unexpected association callback URL before refetching', async () => {
    jest.mocked(isExpectedOAuthCallbackUrl).mockReturnValue(false);

    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.actions.linkOAuth('google');
    });

    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Failed to start link flow: Unexpected OAuth callback URL received. Please try again.',
      'Link failed',
    );
  });
});

describe('linkOAuth callback status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createURL).mockReturnValue('relab-app://account');
    jest.mocked(buildOAuthAuthorizeUrl).mockImplementation((path) => path);
    jest.mocked(fetchOAuthAuthorizationUrl).mockImplementation(async () => ({
      ok: true,
      status: 200,
      detail: undefined,
      authorizationUrl: 'https://oauth.example.com/start',
    }));
    jest.mocked(isAllowedOAuthRedirectUrl).mockReturnValue(true);
    jest.mocked(isExpectedOAuthCallbackUrl).mockReturnValue(true);
    mockRefetch.mockImplementation(async () => undefined);
    mockSetYoutubeEnabled.mockImplementation(async () => undefined);
  });

  // Regression: a denied consent screen completes the browser session, so
  // linkOAuth refetched and told the user nothing. The outcome lives in the
  // callback fragment, not in the session result.
  it('surfaces the callback error when the user denies consent', async () => {
    jest.mocked(openOAuthBrowserSession).mockImplementation(async () => ({
      type: 'success',
      url: 'relab-app://account#status=error&error=access_denied',
    }));

    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.actions.linkOAuth('github');
    });

    expect(mockFeedback.error).toHaveBeenCalledWith('access_denied', 'Link failed');
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('refetches when the callback reports success', async () => {
    jest.mocked(openOAuthBrowserSession).mockImplementation(async () => ({
      type: 'success',
      url: 'relab-app://account#status=success',
    }));

    const { result } = renderHook(() =>
      useOAuthAssociations({
        feedback: mockFeedback,
        refetch: mockRefetch,
        setYoutubeEnabled: mockSetYoutubeEnabled,
      }),
    );

    await act(async () => {
      await result.current.actions.linkOAuth('google');
    });

    expect(mockFeedback.error).not.toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
