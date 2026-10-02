import { describe, expect, it, jest } from '@jest/globals';
import { screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { NewAccountLayout, PrivacyPolicy } from '@/components/auth/NewAccountSections';
import { openExternalUrl } from '@/services/externalLinks';
import { getHostByType, renderWithProviders, setupUser } from '@/test-utils/index';

// EXPO_PUBLIC_WEBSITE_URL is unset under Jest, which would leave both links inert.
const WEBSITE_URL = 'https://relab.example';

jest.mock('@/config', () => ({
  ...(jest.requireActual('@/config') as object),
  WEBSITE_URL: 'https://relab.example',
}));

jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

jest.mock('@/services/externalLinks', () => ({
  openExternalUrl: jest.fn(),
}));

const mockOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

describe('PrivacyPolicy', () => {
  const user = setupUser();

  it('names both agreements a new account accepts', async () => {
    await renderWithProviders(<PrivacyPolicy />);

    expect(screen.getByText('Terms')).toBeOnTheScreen();
    expect(screen.getByText('Privacy Policy')).toBeOnTheScreen();
  });

  it('opens the terms page on the website', async () => {
    await renderWithProviders(<PrivacyPolicy />);

    await user.press(screen.getByText('Terms'));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(new URL('/terms', WEBSITE_URL).toString());
  });

  it('opens the privacy policy on the website', async () => {
    await renderWithProviders(<PrivacyPolicy />);

    await user.press(screen.getByText('Privacy Policy'));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(new URL('/privacy', WEBSITE_URL).toString());
  });
});

describe('NewAccountLayout', () => {
  it('keeps the footer in the scroll flow after the form, clear of the bottom inset', async () => {
    await renderWithProviders(
      <NewAccountLayout onNavigateToLogin={jest.fn()}>
        <Text>Form</Text>
      </NewAccountLayout>,
    );
    const scroll = getHostByType('RCTScrollView');
    expect(scroll.props.contentContainerStyle.paddingBottom).toBe(34 + 20);
    // Inside the ScrollView and after the form, so a short screen scrolls to it
    // instead of the footer covering the step's actions.
    expect(within(scroll).getByTestId('signup-footer')).toBeOnTheScreen();
  });
});
