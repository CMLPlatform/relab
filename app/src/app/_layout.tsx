// biome-ignore lint/style/noRestrictedImports: global.css lives at the app root (outside src/), so it has no '@/' alias path.
import '../../global.css';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  removeOldestQuery,
} from '@tanstack/react-query-persist-client';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { memo, type ReactNode, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { enableScreens } from 'react-native-screens';
import { Uniwind } from 'uniwind';
import { TermsAcceptanceDialog } from '@/components/auth/TermsAcceptanceDialog';
import { DialogProvider } from '@/components/base/DialogProvider';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { KeyboardShortcutsDialog } from '@/components/base/KeyboardShortcutsDialog';
import { OfflineBanner } from '@/components/base/OfflineBanner';
import { StaticBackground } from '@/components/base/StaticBackground';
import { TopNav } from '@/components/base/TopNav';
import { ActiveStreamBanner } from '@/components/cameras/ActiveStreamBanner';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/context/auth';
import { StreamSessionProvider } from '@/context/StreamSessionProvider';
import { useStreamSession } from '@/context/streamSession';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { SAVE_PRODUCT_MUTATION_KEY, saveProductMutationFn } from '@/features/products/queries';
import { shouldDehydrateQuery } from '@/services/persistedQueryCache';
import { QUERY_CACHE_STORAGE_KEY } from '@/services/storage';
import { createNavigationThemes, getAppTheme } from '@/theme';
import { AppThemeProvider } from '@/theme/AppThemeProvider';
import { type BackgroundOverlay, useBackgroundOverlay } from '@/utils/router/background';
import { getUsernameOnboardingRedirect } from '@/utils/router/onboarding';

// Every navigator here paints its scene transparent so StaticBackground shows through.
// Bottom tabs only push an inactive tab behind the active one (z-index), counting on an
// opaque scene to cover it; on web react-native-screens is off by default, so a
// transparent scene showed the previous tab underneath. Enabling it on web swaps in the
// Screen shim, which sets `display: none` on inactive tabs. The web stack view hides
// its own non-focused screens regardless. Must run before any navigator renders.
if (Platform.OS === 'web') enableScreens();

// TODO: wire onlineManager to NetInfo/expo-network for native. Until then it
// stays true on native, so mutations never pause and the queued-offline UI
// (OfflineBanner, QUEUED_OFFLINE_LABEL, isPaused) is web-only.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// A mutation restored from the persisted cache has no mutationFn; this
// re-attaches one by key before resumePausedMutations() runs it.
queryClient.setMutationDefaults(SAVE_PRODUCT_MUTATION_KEY, { mutationFn: saveProductMutationFn });

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
  // Drop the oldest query when a persisted write fails (storage quota).
  retry: removeOldestQuery,
  throttleTime: 5000,
});

function resumePausedMutations() {
  return queryClient.resumePausedMutations();
}

export default function RootLayout() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

function AppBackground({ overlay }: { overlay: BackgroundOverlay }) {
  return (
    <>
      <StaticBackground />
      {overlay.edgeColor ? (
        // Hero routes: calm the band behind the content column, vivid at the edges.
        <LinearGradient
          colors={[overlay.edgeColor, overlay.color, overlay.color, overlay.edgeColor]}
          locations={[0, 0.3, 0.7, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: overlay.color, pointerEvents: 'none' },
          ]}
        />
      )}
    </>
  );
}

// The root stack holds what sits outside the tabs; each tab's screens are
// declared by its group layout under (tabs)/.
// memo: AppShell re-renders on every route change and telemetry tick.
export const AppStack = memo(function AppStack() {
  const router = useRouter();
  // Cross-navigator target: replace() would reset every tab's trail.
  const goToProducts = useCallback(() => router.navigate('/products'), [router]);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="users/[username]"
        options={{
          title: '',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToProducts} />,
        }}
      />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/new-account" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/mfa" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/verify" options={{ headerShown: false }} />
      <Stack.Screen name="category-selection" options={{ title: 'Select category' }} />
    </Stack>
  );
});

function AppShell() {
  const colorScheme = useEffectiveColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const isDark = colorScheme === 'dark';
  const theme = getAppTheme(colorScheme);
  const { user, isLoading: authLoading } = useAuth();
  const { activeStream } = useStreamSession();
  const overlay = useBackgroundOverlay(isDark);

  // Native has no visibilitychange, so drive TanStack's focus manager from
  // AppState; otherwise polling keeps firing in the background.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !activeStream) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [activeStream]);

  // web.output is "single" (SPA), so there's no +html.tsx head hook; inject
  // the theme-adaptive SVG favicon once on mount instead (app.json's PNG stays the fallback).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = '/images/favicon.svg';
    document.head.insertBefore(link, document.head.firstChild);
  }, []);

  useEffect(() => {
    setBackgroundColorAsync(theme.colors.background).catch(() => {
      // Best-effort only; the app can render fine without this on unsupported targets.
    });
  }, [theme.colors.background]);

  useEffect(() => {
    if (authLoading) return;
    const redirectPath = getUsernameOnboardingRedirect({ user, pathname });
    if (redirectPath) {
      router.replace(redirectPath);
    }
  }, [authLoading, pathname, router, user]);

  return (
    <View style={{ flex: 1 }}>
      <AppBackground overlay={overlay} />
      <TopNav />
      <OfflineBanner />
      <AppStack />
      <ActiveStreamBanner />
      <KeyboardShortcutsDialog />
    </View>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: 'v1',
        // `shouldDehydrateMutation` keeps its paused-only default, so a paused
        // offline capture still dehydrates.
        dehydrateOptions: { shouldDehydrateQuery },
      }}
      // Restoring only repopulates caches; paused mutations stay paused until
      // asked. onlineManager gates the network call, so this is a no-op offline.
      onSuccess={resumePausedMutations}
    >
      <AuthProvider>
        <ThemeModeProvider>
          <StreamSessionProvider>
            <ThemedProviders>{children}</ThemedProviders>
          </StreamSessionProvider>
        </ThemeModeProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

// Derived from module constants only.
const { LightTheme, DarkTheme } = createNavigationThemes();

/** Inner providers that depend on the resolved theme mode. */
function ThemedProviders({ children }: { children: ReactNode }) {
  const colorScheme = useEffectiveColorScheme();

  // Keep Uniwind's theme (`dark:` variants, brand.generated.css variables) in
  // sync with the chosen scheme. setTheme also disables adaptive themes when
  // a scheme is forced and calls Appearance.setColorScheme on native.
  useEffect(() => {
    Uniwind.setTheme(colorScheme);
  }, [colorScheme]);

  return (
    <AppThemeProvider scheme={colorScheme}>
      <ThemeProvider value={colorScheme === 'light' ? LightTheme : DarkTheme}>
        <KeyboardProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <DialogProvider>
              {children}
              {/* Needs DialogProvider (toast) and AuthProvider (user flag). */}
              <TermsAcceptanceDialog />
            </DialogProvider>
          </GestureHandlerRootView>
        </KeyboardProvider>
      </ThemeProvider>
    </AppThemeProvider>
  );
}
