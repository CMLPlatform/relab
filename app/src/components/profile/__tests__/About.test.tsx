import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { ProfileAboutSection } from '@/components/profile/About';
import { openExternalUrl } from '@/services/externalLinks';
import { renderWithProviders, setupUser } from '@/test-utils/index';

// EXPO_PUBLIC_DOCS_URL is unset under Jest, which would leave the link inert.
const DOCS_URL = 'https://docs.relab.example';

jest.mock('@/config', () => ({
  ...(jest.requireActual('@/config') as object),
  DOCS_URL: 'https://docs.relab.example',
}));

jest.mock('@/services/externalLinks', () => ({
  openExternalUrl: jest.fn(),
}));

const mockOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

describe('ProfileAboutSection', () => {
  const user = setupUser();

  it('renders the 9R framework row', () => {
    renderWithProviders(<ProfileAboutSection />);

    expect(screen.getByRole('button', { name: 'The 9R framework' })).toBeOnTheScreen();
    expect(screen.getByText('The nine circular-economy strategies behind Relab')).toBeOnTheScreen();
  });

  it('renders the glossary row', () => {
    renderWithProviders(<ProfileAboutSection />);

    expect(screen.getByRole('button', { name: 'Glossary' })).toBeOnTheScreen();
  });

  it('opens the glossary on the docs site', async () => {
    renderWithProviders(<ProfileAboutSection />);

    await user.press(screen.getByRole('button', { name: 'Glossary' }));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      new URL('/user-guides/glossary', DOCS_URL).toString(),
    );
  });

  it('opens the 9R framework page on the docs site', async () => {
    renderWithProviders(<ProfileAboutSection />);

    await user.press(screen.getByRole('button', { name: 'The 9R framework' }));

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      new URL('/project/9r-framework', DOCS_URL).toString(),
    );
  });
});
