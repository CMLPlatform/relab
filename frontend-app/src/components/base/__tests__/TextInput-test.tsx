import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { renderWithProviders } from '@/test-utils/index';
import { getAppTheme } from '@/theme';
import { TextInput } from '../TextInput';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

describe('<TextInput />', () => {
  it('renders placeholder correctly', () => {
    renderWithProviders(<TextInput placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeOnTheScreen();
  });

  it('applies error style (background + text color) when errorOnEmpty is set and value is empty', () => {
    renderWithProviders(<TextInput testID="test-input" errorOnEmpty={true} value="" />);
    const input = screen.getByTestId('test-input');
    expect(input).toHaveStyle({ backgroundColor: getAppTheme('light').colors.errorContainer });
    expect(input).toHaveStyle({ color: getAppTheme('light').colors.onErrorContainer });
  });

  it('applies error style when customValidation returns false', () => {
    const failValidation = (val: string) => val.includes('valid');
    renderWithProviders(
      <TextInput testID="validation-input" value="bad" customValidation={failValidation} />,
    );
    const input = screen.getByTestId('validation-input');
    expect(input).toHaveStyle({ backgroundColor: getAppTheme('light').colors.errorContainer });
    expect(input).toHaveStyle({ color: getAppTheme('light').colors.onErrorContainer });
  });

  it('applies default text color when there is no error', () => {
    renderWithProviders(<TextInput testID="normal-input" value="valid" />);
    const input = screen.getByTestId('normal-input');
    expect(input).toHaveStyle({ color: getAppTheme('light').colors.onSurface });
  });

  it('applies dark mode placeholder and text colors when there is no error', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('dark');

    renderWithProviders(<TextInput testID="dark-input" value="valid" placeholder="Dark mode" />);

    const input = screen.getByTestId('dark-input');
    expect(input).toHaveStyle({ color: getAppTheme('dark').colors.onSurface });
    expect(input).toHaveProp('placeholderTextColor', getAppTheme('dark').colors.onSurface);

    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
  });

  it('does not treat a passing customValidation function as an error', () => {
    const passValidation = (val: string) => val.length >= 3;
    renderWithProviders(
      <TextInput testID="passing-validation" value="okay" customValidation={passValidation} />,
    );
    expect(screen.getByTestId('passing-validation')).toBeOnTheScreen();
  });
});
