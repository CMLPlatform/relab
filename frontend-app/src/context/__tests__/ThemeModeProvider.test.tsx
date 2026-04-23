// Unmock the module so we test the real implementation instead of the
// global stub registered in jest.setup.ts.
jest.unmock('@/context/ThemeModeProvider');

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn().mockResolvedValue({}),
}));

import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '@/context/auth';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';
import { useEffectiveColorScheme, useThemeMode } from '@/context/themeMode';
import { updateUser } from '@/services/api/authentication';

const mockRefetch = jest.fn();

describe('ThemeModeProvider / useThemeMode', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: { theme_mode: 'light' } },
      refetch: mockRefetch,
    });
  });

  it('exposes themeMode from the user preferences', () => {
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
    expect(result.current.themeMode).toBe('light');
  });

  it('defaults themeMode to "auto" when no preference is set', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: {} },
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
    expect(result.current.themeMode).toBe('auto');
  });

  it('defaults themeMode to "auto" when user has no preferences object', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {},
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
    expect(result.current.themeMode).toBe('auto');
  });

  it('returns the explicit effectiveColorScheme when themeMode is "light"', () => {
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
    expect(result.current.effectiveColorScheme).toBe('light');
  });

  it('returns "dark" effectiveColorScheme when themeMode is "dark"', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: { theme_mode: 'dark' } },
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
    expect(result.current.effectiveColorScheme).toBe('dark');
  });

  it('falls back to system scheme ("light") when themeMode is "auto"', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: { theme_mode: 'auto' } },
      refetch: mockRefetch,
    });
    // useColorScheme returns null in the test environment → resolved to 'light'
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
    expect(result.current.effectiveColorScheme).toBe('light');
  });

  it('setThemeMode calls updateUser and refetch', async () => {
    mockRefetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });

    await act(async () => {
      await result.current.setThemeMode('dark');
    });

    expect(updateUser).toHaveBeenCalledWith({ preferences: { theme_mode: 'dark' } });
    expect(mockRefetch).toHaveBeenCalledWith(false);
  });

  it('throws when used outside ThemeModeProvider', () => {
    // Suppress the React error boundary console noise
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useThemeMode())).toThrow(
      'useThemeMode must be used within ThemeModeProvider',
    );
    (console.error as jest.Mock).mockRestore();
  });
});

describe('useEffectiveColorScheme', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: { theme_mode: 'light' } },
      refetch: mockRefetch,
    });
  });

  it('falls back to the system scheme when used outside the provider', () => {
    // useColorScheme() → null in test env → 'light'
    const { result } = renderHook(() => useEffectiveColorScheme());
    expect(result.current).toBe('light');
  });

  it('returns the provider effectiveColorScheme when inside the provider', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: { theme_mode: 'dark' } },
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useEffectiveColorScheme(), {
      wrapper: ThemeModeProvider,
    });
    expect(result.current).toBe('dark');
  });

  it('resolves "auto" to the system scheme ("light") inside the provider', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { preferences: { theme_mode: 'auto' } },
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => useEffectiveColorScheme(), {
      wrapper: ThemeModeProvider,
    });
    expect(result.current).toBe('light');
  });
});
