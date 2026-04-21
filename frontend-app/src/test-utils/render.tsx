import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderOptions } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import type React from 'react';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogProvider } from '@/components/common/DialogProvider';
import { AuthProvider } from '@/context/AuthProvider';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';

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
  const needsAuth = withAuth ? true : withThemeMode;
  const testTheme = {
    ...MD3LightTheme,
    animation: {
      ...MD3LightTheme.animation,
      scale: 0,
    },
  };
  const safeAreaMetrics = initialWindowMetrics ?? {
    frame: { x: 0, y: 0, width: 320, height: 640 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  function Wrapper({ children }: { children: React.ReactNode }) {
    let content = withDialog ? <DialogProvider>{children}</DialogProvider> : children;
    if (withThemeMode) content = <ThemeModeProvider>{content}</ThemeModeProvider>;
    const withPaper = <PaperProvider theme={testTheme}>{content}</PaperProvider>;
    const withSafeArea = (
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>{withPaper}</SafeAreaProvider>
    );
    const withQuery = (
      <QueryClientProvider client={queryClient}>{withSafeArea}</QueryClientProvider>
    );
    return needsAuth ? <AuthProvider>{withQuery}</AuthProvider> : withQuery;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
