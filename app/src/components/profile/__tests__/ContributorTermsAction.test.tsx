import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { ContributorTermsAction } from '@/components/profile/ContributorTermsAction';
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

const EXCLUDED_FROM_DATASETS = /stay out of published datasets/;

function signedInWith(termsAcceptanceRequired: boolean) {
  mockUseAuth.mockReturnValue({
    user: mockUser({ termsAcceptanceRequired }),
    isLoading: false,
    refetch: jest.fn(async () => undefined),
  });
}

describe('the contributor-terms row on the account screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTermsPromptDismissed.setState({ dismissed: false });
  });

  it('is absent once acceptance is on record', () => {
    signedInWith(false);

    renderWithProviders(<ContributorTermsAction />, { withDialog: true });

    // A settled agreement is not a setting.
    expect(screen.queryByText('Contributor terms')).toBeNull();
  });

  it('shows the unaccepted state and what it costs', () => {
    signedInWith(true);

    renderWithProviders(<ContributorTermsAction />, { withDialog: true });

    expect(screen.getByText('Contributor terms')).toBeTruthy();
    expect(screen.getByText(EXCLUDED_FROM_DATASETS)).toBeTruthy();
  });

  it('clears the shared dismissal so the mounted dialog reopens', () => {
    // The regression this guards: the dialog is mounted once globally while this row
    // lives on another screen. With the dismissal held in hook-local state, each
    // caller got its own copy and pressing this row reopened nothing.
    signedInWith(true);
    useTermsPromptDismissed.setState({ dismissed: true });

    renderWithProviders(<ContributorTermsAction />, { withDialog: true });
    fireEvent.press(screen.getByText('Contributor terms'));

    expect(useTermsPromptDismissed.getState().dismissed).toBe(false);
  });

  it('stays visible after a dismissal, so the way back is never lost', () => {
    signedInWith(true);
    useTermsPromptDismissed.setState({ dismissed: true });

    renderWithProviders(<ContributorTermsAction />, { withDialog: true });

    expect(screen.getByText('Contributor terms')).toBeTruthy();
  });
});
