import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { ProfileReleaseCreditSection } from '@/components/profile/Preferences';
import { renderWithProviders, setupUser } from '@/test-utils/index';
import type { ProfileVisibility, User } from '@/types/User';

const LABEL = 'Credit me in dataset releases';
const IRREVERSIBILITY = /cannot be withdrawn/i;

function makeProfile(visibility: ProfileVisibility, creditInReleases = false): User {
  return {
    id: 'user-1',
    email: 'contributor@example.com',
    isActive: true,
    isSuperuser: false,
    isVerified: true,
    mfaEnabled: false,
    hasUsablePassword: true,
    username: 'contributor',
    oauth_accounts: [],
    preferences: { profile_visibility: visibility },
    credit_in_releases: creditInReleases,
  };
}

describe('ProfileReleaseCreditSection', () => {
  const user = setupUser();

  it('offers the consent to a public profile', () => {
    renderWithProviders(
      <ProfileReleaseCreditSection
        profile={makeProfile('public')}
        saving={false}
        onSetEnabled={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(LABEL)).toBeOnTheScreen();
  });

  it.each(['community', 'private'] as const)(
    'hides the consent from a %s profile, which is not eligible',
    (visibility) => {
      renderWithProviders(
        <ProfileReleaseCreditSection
          profile={makeProfile(visibility)}
          saving={false}
          onSetEnabled={jest.fn()}
        />,
      );

      expect(screen.queryByLabelText(LABEL)).toBeNull();
    },
  );

  it('says a published release cannot be withdrawn', () => {
    renderWithProviders(
      <ProfileReleaseCreditSection
        profile={makeProfile('public')}
        saving={false}
        onSetEnabled={jest.fn()}
      />,
    );

    expect(screen.getByText(IRREVERSIBILITY)).toBeOnTheScreen();
  });

  it('is off until the user turns it on', async () => {
    const onSetEnabled = jest.fn();
    renderWithProviders(
      <ProfileReleaseCreditSection
        profile={makeProfile('public')}
        saving={false}
        onSetEnabled={onSetEnabled}
      />,
    );

    const toggle = screen.getByLabelText(LABEL);
    expect(screen.getByText('Currently disabled.')).toBeOnTheScreen();

    await user.press(toggle);
    expect(onSetEnabled).toHaveBeenCalledWith(true);
  });
});
