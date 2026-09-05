import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { PrivacyPolicy } from '@/components/auth/NewAccountSections';
import { openExternalUrl } from '@/services/externalLinks';
import { renderWithProviders, setupUser } from '@/test-utils/index';

// EXPO_PUBLIC_WEBSITE_URL is unset under Jest, which would leave both links inert.
const WEBSITE_URL = 'https://relab.example';

jest.mock('@/config', () => ({
  ...(jest.requireActual('@/config') as object),
  WEBSITE_URL: 'https://relab.example',
}));

jest.mock('@/services/externalLinks', () => ({
  openExternalUrl: jest.fn(),
}));

const mockOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

describe('PrivacyPolicy', () => {
  const user = setupUser();

  it('names both agreements a new account accepts', () => {
    renderWithProviders(<PrivacyPolicy />);

    expect(screen.getByText('Terms')).toBeOnTheScreen();
    expect(screen.getByText('Privacy Policy')).toBeOnTheScreen();
  });

  it('opens the terms page on the website', async () => {
    renderWithProviders(<PrivacyPolicy />);

    await user.press(screen.getByText('Terms'));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(new URL('/terms', WEBSITE_URL).toString());
  });

  it('opens the privacy policy on the website', async () => {
    renderWithProviders(<PrivacyPolicy />);

    await user.press(screen.getByText('Privacy Policy'));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(new URL('/privacy', WEBSITE_URL).toString());
  });
});
