import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { TermsAcceptanceDialog } from '@/components/auth/TermsAcceptanceDialog';
// biome-ignore lint/performance/noNamespaceImport: the namespace object is the thing under test control — setWebsiteUrl redefines a property on it.
import * as config from '@/config';
import { useTermsPromptDismissed } from '@/features/auth/useTermsAcceptance';
import { mockUser } from '@/test-utils/api-mocks';
import { renderWithProviders } from '@/test-utils/index';

const mockUseAuth = jest.fn();
jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/api/terms', () => ({
  acceptContributorTerms: jest.fn(),
}));

jest.mock('@/services/externalLinks', () => ({
  openExternalUrl: jest.fn(),
}));

// WEBSITE_URL comes from the Expo env at module load and is unset under Jest, so the
// component would hide "Read terms" for every test. Overridden per test on the module
// object rather than through jest.mock(): a mock factory is hoisted above this file's
// own declarations, so a factory reading a local would only ever see it uninitialised.
function setWebsiteUrl(value: string | undefined) {
  Object.defineProperty(config, 'WEBSITE_URL', { value, configurable: true });
}

const { acceptContributorTerms } = jest.requireMock('@/services/api/terms') as {
  acceptContributorTerms: jest.Mock<() => Promise<void>>;
};
const { openExternalUrl } = jest.requireMock('@/services/externalLinks') as {
  openExternalUrl: jest.Mock;
};

const DECLINE_IS_FREE = /Nothing changes if you decline/;

const refetch = jest.fn(async () => undefined);

function signedInWith(termsAcceptanceRequired: boolean) {
  mockUseAuth.mockReturnValue({
    user: mockUser({ termsAcceptanceRequired }),
    isLoading: false,
    refetch,
  });
}

describe('TermsAcceptanceDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    acceptContributorTerms.mockResolvedValue(undefined);
    globalThis.sessionStorage?.clear();
    useTermsPromptDismissed.setState({ dismissed: false });
    setWebsiteUrl('https://relab.example');
  });

  it('stays closed when the account has already accepted', () => {
    signedInWith(false);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });

    expect(screen.queryByText('Contributor terms')).toBeNull();
  });

  it('stays closed when signed out', () => {
    mockUseAuth.mockReturnValue({ user: undefined, isLoading: false, refetch });

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });

    expect(screen.queryByText('Contributor terms')).toBeNull();
  });

  it('prompts an account that still owes acceptance', () => {
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });

    expect(screen.getByText('Contributor terms')).toBeTruthy();
    expect(screen.getByText('Accept')).toBeTruthy();
  });

  it('says plainly that declining costs nothing', () => {
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });

    // The consent is only meaningful if the refusal is real and seen to be free.
    expect(screen.getByText(DECLINE_IS_FREE)).toBeTruthy();
  });

  it('accepts, then closes without asking again', async () => {
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });
    fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => expect(acceptContributorTerms).toHaveBeenCalledTimes(1));
    // Refetched rather than patched locally: the server owns the version it stamped.
    await waitFor(() => expect(refetch).toHaveBeenCalledWith(true));

    signedInWith(false);
    screen.rerender(<TermsAcceptanceDialog />);
    expect(screen.queryByText('Accept')).toBeNull();
  });

  it('dismisses for the session without recording anything', () => {
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });
    fireEvent.press(screen.getByText('Not now'));

    expect(acceptContributorTerms).not.toHaveBeenCalled();
    expect(useTermsPromptDismissed.getState().dismissed).toBe(true);
    expect(screen.queryByText('Accept')).toBeNull();
  });

  it('opens the public terms page rather than restating them in the app', () => {
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });
    fireEvent.press(screen.getByText('Read terms'));

    expect(openExternalUrl).toHaveBeenCalledTimes(1);
    expect(String(openExternalUrl.mock.calls[0][0])).toContain('/terms');
  });

  it('hides the terms link when no public site URL is configured', () => {
    setWebsiteUrl(undefined);
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });

    // A button that opens nothing is worse than no button. Accepting still works:
    // an unconfigured site URL must not block the grant itself.
    expect(screen.queryByText('Read terms')).toBeNull();
    expect(screen.getByText('Accept')).toBeTruthy();
  });

  it('remembers the dismissal across a reload', () => {
    // Regression: the dismissal used to be in-memory only, so every page load
    // re-opened the modal. That is nagging rather than asking, and it blocked
    // every authenticated e2e spec that navigates with a full page load.
    signedInWith(true);

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });
    fireEvent.press(screen.getByText('Not now'));

    expect(globalThis.sessionStorage.getItem('terms_prompt_dismissed')).toBe('true');
  });

  it('keeps the prompt due after a dismissal, so the next login asks again', () => {
    signedInWith(true);
    useTermsPromptDismissed.setState({ dismissed: true });

    renderWithProviders(<TermsAcceptanceDialog />, { withDialog: true });

    // Dismissal hides the dialog but must not look like acceptance anywhere else:
    // the account row keys off `required`, which is untouched.
    expect(screen.queryByText('Accept')).toBeNull();
    expect(mockUser({ termsAcceptanceRequired: true }).termsAcceptanceRequired).toBe(true);
  });
});
