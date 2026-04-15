import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';
import { useEffectiveColorScheme } from '@/context/ThemeModeProvider';
import { setupUser } from '@/test-utils';
import { Chip } from '../Chip';

describe('Chip', () => {
  const user = setupUser();

  it('renders children text', () => {
    render(<Chip>My Label</Chip>);
    expect(screen.getByText('My Label')).toBeOnTheScreen();
  });

  it('renders title when provided', () => {
    render(<Chip title="Title Text">Content</Chip>);
    expect(screen.getByText('Title Text')).toBeOnTheScreen();
  });

  it('renders without title by default', () => {
    render(<Chip>No Title</Chip>);
    expect(screen.queryByText('Title Text')).toBeNull();
  });

  it('calls onPress handler when pressed', async () => {
    const onPress = jest.fn();
    render(<Chip onPress={onPress}>Press Me</Chip>);
    await user.press(screen.getByText('Press Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('applies error container style when error prop is set', () => {
    render(<Chip error>Error Chip</Chip>);
    expect(screen.getByText('Error Chip')).toHaveStyle({
      backgroundColor: LightTheme.colors.errorContainer,
      color: LightTheme.colors.onErrorContainer,
    });
  });

  it('applies primary style when error prop is not set', () => {
    render(<Chip>Normal Chip</Chip>);
    expect(screen.getByText('Normal Chip')).toHaveStyle({
      backgroundColor: LightTheme.colors.primary,
      color: LightTheme.colors.onPrimary,
    });
  });

  it('applies dark mode styles when the system theme is dark', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('dark');

    render(<Chip>Dark Chip</Chip>);

    expect(screen.getByText('Dark Chip')).toHaveStyle({
      backgroundColor: DarkTheme.colors.primary,
      color: DarkTheme.colors.onPrimary,
    });

    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
  });

  it('renders an icon when one is provided', () => {
    render(
      <Chip icon={<ReactNative.View testID="chip-icon" />} title="With Icon">
        Chip Content
      </Chip>,
    );

    expect(screen.getByTestId('chip-icon')).toBeOnTheScreen();
  });
});
