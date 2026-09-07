import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { TextInput } from '@/components/base/TextInput';
import { radius } from '@/constants';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { renderWithProviders } from '@/test-utils/index';
import { getAppTheme } from '@/theme';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

describe('<TextInput />', () => {
  it('renders placeholder correctly', () => {
    renderWithProviders(<TextInput placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeOnTheScreen();
  });

  it('applies a danger border when errorOnEmpty is set and value is empty', () => {
    renderWithProviders(<TextInput testID="test-input" errorOnEmpty={true} value="" />);
    const input = screen.getByTestId('test-input');
    expect(input).toHaveStyle({
      borderWidth: 1,
      borderColor: getAppTheme('light').tokens.status.danger,
    });
  });

  it('applies a danger border when customValidation returns false', () => {
    const failValidation = (val: string) => val.includes('valid');
    renderWithProviders(
      <TextInput testID="validation-input" value="bad" customValidation={failValidation} />,
    );
    const input = screen.getByTestId('validation-input');
    expect(input).toHaveStyle({
      borderWidth: 1,
      borderColor: getAppTheme('light').tokens.status.danger,
    });
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
    expect(input).toHaveProp('placeholderTextColor', getAppTheme('dark').colors.onSurfaceVariant);

    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
  });

  // DESIGN.md "Form language — Flat & Sharp": the primitive owns the control
  // radius so call sites don't hardcode one; a caller style may still override.
  it('applies the control radius by default', () => {
    renderWithProviders(<TextInput testID="radius-default" value="" />);
    expect(screen.getByTestId('radius-default')).toHaveStyle({ borderRadius: radius.control });
  });

  it('lets a caller style override the default radius', () => {
    renderWithProviders(
      <TextInput testID="radius-override" value="" style={{ borderRadius: 2 }} />,
    );
    expect(screen.getByTestId('radius-override')).toHaveStyle({ borderRadius: 2 });
  });

  it('does not treat a passing customValidation function as an error', () => {
    const passValidation = (val: string) => val.length >= 3;
    renderWithProviders(
      <TextInput testID="passing-validation" value="okay" customValidation={passValidation} />,
    );
    const input = screen.getByTestId('passing-validation');
    expect(input).not.toHaveStyle({
      borderColor: getAppTheme('light').tokens.status.danger,
    });
    expect(input).toHaveStyle({ color: getAppTheme('light').colors.onSurface });
  });
});
