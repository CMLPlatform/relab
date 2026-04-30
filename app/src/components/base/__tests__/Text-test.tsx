import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { renderWithProviders } from '@/test-utils/index';
import { getAppTheme } from '@/theme';
import { Text } from '../Text';

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: jest.fn(() => 'light'),
}));

describe('Text', () => {
  afterEach(() => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
  });

  it('renders children text', () => {
    renderWithProviders(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });

  it('applies light-mode text color in light mode', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
    renderWithProviders(<Text testID="txt">Light text</Text>);
    expect(screen.getByTestId('txt')).toHaveStyle({ color: getAppTheme('light').colors.onSurface });
  });

  it('applies dark-mode text color in dark mode', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('dark');
    renderWithProviders(<Text testID="txt">Dark text</Text>);
    expect(screen.getByTestId('txt')).toHaveStyle({ color: getAppTheme('dark').colors.onSurface });
  });

  it('merges a custom style prop without overriding theme color', () => {
    jest.mocked(useEffectiveColorScheme).mockReturnValue('light');
    renderWithProviders(
      <Text testID="txt" style={{ fontWeight: 'bold' }}>
        Styled
      </Text>,
    );
    const el = screen.getByTestId('txt');
    expect(el).toHaveStyle({ fontWeight: 'bold' });
    expect(el).toHaveStyle({ color: getAppTheme('light').colors.onSurface });
  });
});
