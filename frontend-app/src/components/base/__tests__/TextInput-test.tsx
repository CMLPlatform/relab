import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import DarkTheme from '@/assets/themes/dark';
import { TextInput } from '../TextInput';

describe('<TextInput />', () => {
  it('renders placeholder correctly', () => {
    render(<TextInput placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('applies error style (background + text color) when errorOnEmpty is set and value is empty', () => {
    render(<TextInput testID="test-input" errorOnEmpty={true} value="" />);
    const input = screen.getByTestId('test-input');
    expect(input).toHaveStyle({ backgroundColor: 'rgb(255, 218, 214)' });
    expect(input).toHaveStyle({ color: 'rgb(65, 0, 2)' });
  });

  it('applies error style when customValidation returns false', () => {
    const failValidation = (val: string) => val.includes('valid');
    render(<TextInput testID="validation-input" value="bad" customValidation={failValidation} />);
    const input = screen.getByTestId('validation-input');
    expect(input).toHaveStyle({ backgroundColor: 'rgb(255, 218, 214)' });
    expect(input).toHaveStyle({ color: 'rgb(65, 0, 2)' });
  });

  it('applies default text color when there is no error', () => {
    render(<TextInput testID="normal-input" value="valid" />);
    const input = screen.getByTestId('normal-input');
    expect(input).toHaveStyle({ color: 'rgb(25, 28, 30)' });
  });

  it('applies dark mode placeholder and text colors when there is no error', () => {
    const colorSchemeSpy = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');

    render(<TextInput testID="dark-input" value="valid" placeholder="Dark mode" />);

    const input = screen.getByTestId('dark-input');
    expect(input).toHaveStyle({ color: DarkTheme.colors.onSurface });
    expect(input).toHaveProp('placeholderTextColor', DarkTheme.colors.onSurface);
    colorSchemeSpy.mockRestore();
  });

  it('does not treat a passing customValidation function as an error', () => {
    const passValidation = (val: string) => val.length >= 3;
    render(
      <TextInput testID="passing-validation" value="okay" customValidation={passValidation} />,
    );
    expect(screen.getByTestId('passing-validation')).toBeTruthy();
  });
});
