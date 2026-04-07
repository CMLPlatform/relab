import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { renderWithProviders } from '@/test-utils';
import { Text } from '../Text';

describe('Text', () => {
  let useColorSchemeSpy: ReturnType<typeof jest.spyOn> | undefined;

  afterEach(() => {
    useColorSchemeSpy?.mockRestore();
  });

  it('renders children text', () => {
    renderWithProviders(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });

  it('applies light-mode text color in light mode', () => {
    useColorSchemeSpy = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    renderWithProviders(<Text testID="txt">Light text</Text>);
    expect(screen.getByTestId('txt')).toHaveStyle({ color: 'rgb(25, 28, 30)' });
  });

  it('applies dark-mode text color in dark mode', () => {
    useColorSchemeSpy = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    renderWithProviders(<Text testID="txt">Dark text</Text>);
    // DarkTheme.colors.onSurface
    expect(screen.getByTestId('txt')).toHaveStyle({ color: 'rgb(225, 226, 228)' });
  });

  it('merges a custom style prop without overriding theme color', () => {
    useColorSchemeSpy = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    renderWithProviders(
      <Text testID="txt" style={{ fontWeight: 'bold' }}>
        Styled
      </Text>,
    );
    const el = screen.getByTestId('txt');
    expect(el).toHaveStyle({ fontWeight: 'bold' });
    expect(el).toHaveStyle({ color: 'rgb(25, 28, 30)' });
  });
});
