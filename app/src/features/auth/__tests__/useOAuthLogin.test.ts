import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useOAuthLogin } from '@/features/auth/useOAuthLogin';

const mockFetchAuthorizationUrl = jest.fn<() => Promise<Record<string, unknown>>>();
const mockOpenBrowserSession = jest.fn<() => Promise<Record<string, unknown>>>();
const mockParseCallbackUrl = jest.fn<() => Record<string, unknown> | undefined>();
const mockGetUser = jest.fn<() => Promise<Record<string, unknown> | null>>();
const mockClaimOAuthMfaHandoff = jest.fn<() => Promise<Record<string, unknown>>>();

jest.mock('@/services/api/oauthFlow', () => ({
  buildOAuthAuthorizeUrl: (url: string) => url,
  fetchOAuthAuthorizationUrl: () => mockFetchAuthorizationUrl(),
  isAllowedOAuthRedirectUrl: () => true,
  isExpectedOAuthCallbackUrl: () => true,
  openOAuthBrowserSession: () => mockOpenBrowserSession(),
  parseOAuthCallbackUrl: () => mockParseCallbackUrl(),
}));
jest.mock('@/services/api/auth/authentication', () => ({
  getUser: () => mockGetUser(),
  markWebSessionActive: jest.fn(),
}));
jest.mock('@/services/api/auth/authMfa', () => ({
  claimOAuthMfaHandoff: () => mockClaimOAuthMfaHandoff(),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `relab://${path}` }));

const ACCOUNT_NOT_LINKED = 'OAUTH_USER_ALREADY_EXISTS';

function renderOAuthLogin() {
  const dialog = { alert: jest.fn(), input: jest.fn(), toast: jest.fn() };
  const completeSuccessfulLogin = jest.fn<(user: unknown) => Promise<void>>();
  const showAccountAlreadyRegisteredDialog = jest.fn();
  const handleMfaPending = jest.fn();

  const { result } = renderHook(() =>
    useOAuthLogin({
      // biome-ignore lint/suspicious/noExplicitAny: test doubles for the hook's collaborators
      dialog: dialog as any,
      // biome-ignore lint/suspicious/noExplicitAny: test doubles for the hook's collaborators
      completeSuccessfulLogin: completeSuccessfulLogin as any,
      showAccountAlreadyRegisteredDialog,
      // biome-ignore lint/suspicious/noExplicitAny: test doubles for the hook's collaborators
      handleMfaPending: handleMfaPending as any,
    }),
  );

  return {
    result,
    dialog,
    completeSuccessfulLogin,
    showAccountAlreadyRegisteredDialog,
    handleMfaPending,
  };
}

beforeEach(() => {
  mockFetchAuthorizationUrl.mockReset();
  mockOpenBrowserSession.mockReset();
  mockParseCallbackUrl.mockReset();
  mockGetUser.mockReset();
  mockClaimOAuthMfaHandoff.mockReset();

  mockFetchAuthorizationUrl.mockResolvedValue({
    ok: true,
    status: 200,
    authorizationUrl: 'https://accounts.google.com/o/oauth2/auth',
  });
  mockOpenBrowserSession.mockResolvedValue({
    type: 'success',
    url: 'relab://login#status=success',
  });
  mockParseCallbackUrl.mockReturnValue({ status: 'success' });
  mockGetUser.mockResolvedValue({ id: 'user-1', isActive: true });
});

describe('useOAuthLogin', () => {
  it('routes an mfa_required callback into the MFA handoff instead of signing in', async () => {
    mockParseCallbackUrl.mockReturnValue({ status: 'mfa_required', mfaHandoff: 'handoff-token' });
    mockClaimOAuthMfaHandoff.mockResolvedValue({ mfaToken: 'mfa-token' });
    const { result, handleMfaPending, completeSuccessfulLogin } = renderOAuthLogin();

    await act(async () => {
      await result.current.handleOAuthLogin('google');
    });

    expect(mockClaimOAuthMfaHandoff).toHaveBeenCalled();
    expect(handleMfaPending).toHaveBeenCalledWith({ mfaToken: 'mfa-token' });
    // A pending MFA challenge is not a completed login.
    expect(completeSuccessfulLogin).not.toHaveBeenCalled();
  });

  it('shows the already-registered dialog when the provider account is not linked', async () => {
    // The authorize call itself reports this, before any browser session opens.
    mockFetchAuthorizationUrl.mockResolvedValue({
      ok: false,
      status: 400,
      detail: ACCOUNT_NOT_LINKED,
    });
    const { result, showAccountAlreadyRegisteredDialog, dialog } = renderOAuthLogin();

    await act(async () => {
      await result.current.handleOAuthLogin('google');
    });

    expect(showAccountAlreadyRegisteredDialog).toHaveBeenCalled();
    // This is a recoverable, explained state, not a generic sign-in failure.
    expect(dialog.alert).not.toHaveBeenCalled();
  });

  it('reports a failure when the session never materialises after sign-in', async () => {
    // getUser returning null on every attempt means the cookie or token never
    // landed. The hook retries with a backoff, so drive the timers rather than
    // waiting on them.
    jest.useFakeTimers();
    mockGetUser.mockResolvedValue(null);
    const { result, dialog, completeSuccessfulLogin } = renderOAuthLogin();

    await act(async () => {
      const pending = result.current.handleOAuthLogin('google');
      await jest.advanceTimersByTimeAsync(5_000);
      await pending;
    });

    expect(completeSuccessfulLogin).not.toHaveBeenCalled();
    expect(dialog.alert).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('completes the login when the callback reports success', async () => {
    const { result, completeSuccessfulLogin } = renderOAuthLogin();

    await act(async () => {
      await result.current.handleOAuthLogin('google');
    });

    expect(completeSuccessfulLogin).toHaveBeenCalledWith({ id: 'user-1', isActive: true });
  });

  it('surfaces a suspended account instead of completing the login', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', isActive: false });
    const { result, dialog, completeSuccessfulLogin } = renderOAuthLogin();

    await act(async () => {
      await result.current.handleOAuthLogin('google');
    });

    expect(completeSuccessfulLogin).not.toHaveBeenCalled();
    expect(dialog.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Account suspended' }),
    );
  });
});
