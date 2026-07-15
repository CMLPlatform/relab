import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderOptions } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import type React from 'react';
import { PaperProvider } from 'react-native-paper';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogProvider } from '@/components/base/DialogProvider';
import { AuthProvider } from '@/context/AuthProvider';
import { StreamSessionProvider } from '@/context/StreamSessionProvider';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { getAppTheme } from '@/theme';
import { AppThemeProvider } from '@/theme/AppThemeProvider';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  withDialog?: boolean;
  /**
   * Wrap in AuthProvider. Only needed for screens that call `useAuth()`.
   * AuthProvider initialises asynchronously; tests using this option must
   * await `waitFor(...)` before asserting on auth-gated content.
   */
  withAuth?: boolean;
  /** Wrap in ThemeModeProvider. Requires withAuth since ThemeModeProvider uses useAuth(). */
  withThemeMode?: boolean;
}

/**
 * Custom render that wraps the UI in the app's standard provider stack.
 *
 * Always includes PaperProvider and QueryClientProvider (retry disabled so
 * tests don't hang on failed queries). Pass `withDialog: true` for screens
 * that use DialogProvider, and `withAuth: true` for screens that call useAuth().
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    withDialog = false,
    withAuth = false,
    withThemeMode = false,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  // withThemeMode requires auth since ThemeModeProvider calls useAuth()
  const needsAuth = withAuth || withThemeMode;
  const safeAreaMetrics = initialWindowMetrics ?? {
    frame: { x: 0, y: 0, width: 320, height: 640 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  function Wrapper({ children }: { children: React.ReactNode }) {
    const colorScheme = useEffectiveColorScheme();
    const testTheme = {
      ...getAppTheme(colorScheme),
      animation: {
        ...getAppTheme(colorScheme).animation,
        scale: 0,
      },
    };
    // StreamSessionProvider is always mounted in the app's Providers stack and is
    // dependency-free, so include it unconditionally rather than behind a flag.
    let content = withDialog ? <DialogProvider>{children}</DialogProvider> : children;
    content = <StreamSessionProvider>{content}</StreamSessionProvider>;
    if (withThemeMode) content = <ThemeModeProvider>{content}</ThemeModeProvider>;
    // AppThemeProvider wraps PaperProvider, not the reverse — see the matching
    // comment in _layout.tsx: Paper's Portal (Dialog/Menu/Snackbar) renders outside
    // PaperProvider's normal children, so a provider nested inside PaperProvider
    // never reaches portaled content.
    const withPaper = <PaperProvider theme={testTheme}>{content}</PaperProvider>;
    const withAppTheme = <AppThemeProvider scheme={colorScheme}>{withPaper}</AppThemeProvider>;
    const withSafeArea = (
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>{withAppTheme}</SafeAreaProvider>
    );
    const withAuth = needsAuth ? <AuthProvider>{withSafeArea}</AuthProvider> : withSafeArea;
    return <QueryClientProvider client={queryClient}>{withAuth}</QueryClientProvider>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
