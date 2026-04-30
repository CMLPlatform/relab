import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { setupUser } from '@/test-utils/index';
import { renderWithProviders } from '@/test-utils/render';
import { getAppTheme } from '@/theme';
import { Chip } from '../Chip';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

describe('Chip', () => {
  const user = setupUser();

  it('renders children text', () => {
    renderWithProviders(<Chip>My Label</Chip>);
    expect(screen.getByText('My Label')).toBeOnTheScreen();
  });

  it('renders title when provided', () => {
    renderWithProviders(<Chip title="Title Text">Content</Chip>);
    expect(screen.getByText('Title Text')).toBeOnTheScreen();
  });

  it('renders without title by default', () => {
    renderWithProviders(<Chip>No Title</Chip>);
    expect(screen.queryByText('Title Text')).toBeNull();
  });

  it('calls onPress handler when pressed', async () => {
    const onPress = jest.fn();
    renderWithProviders(<Chip onPress={onPress}>Press Me</Chip>);
    await user.press(screen.getByText('Press Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('applies error container style when error prop is set', () => {
    renderWithProviders(<Chip error>Error Chip</Chip>);
    expect(screen.getByText('Error Chip')).toHaveStyle({
      backgroundColor: getAppTheme('light').colors.errorContainer,
      color: getAppTheme('light').colors.onErrorContainer,
    });
  });

  it('applies primary style when error prop is not set', () => {
    renderWithProviders(<Chip>Normal Chip</Chip>);
    expect(screen.getByText('Normal Chip')).toHaveStyle({
      backgroundColor: getAppTheme('light').colors.primary,
      color: getAppTheme('light').colors.onPrimary,
    });
  });

  it('applies dark mode styles when the system theme is dark', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('dark');

    renderWithProviders(<Chip>Dark Chip</Chip>);

    expect(screen.getByText('Dark Chip')).toHaveStyle({
      backgroundColor: getAppTheme('dark').colors.primary,
      color: getAppTheme('dark').colors.onPrimary,
    });

    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
  });

  it('renders an icon when one is provided', () => {
    renderWithProviders(
      <Chip icon={<View testID="chip-icon" />} title="With Icon">
        Chip Content
      </Chip>,
    );

    expect(screen.getByTestId('chip-icon')).toBeOnTheScreen();
  });
});
