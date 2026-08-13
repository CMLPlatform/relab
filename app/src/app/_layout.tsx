// biome-ignore lint/style/noRestrictedImports: global.css lives at the app root (outside src/), so it has no '@/' alias path.
import '../../global.css';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { memo, type ReactNode, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus, Platform, StyleSheet, View } from 'react-native';
import { colorScheme as nativewindColorScheme } from 'react-native-css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DialogProvider } from '@/components/base/DialogProvider';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { OfflineBanner } from '@/components/base/OfflineBanner';
import { StaticBackground } from '@/components/base/StaticBackground';
import { TopNav } from '@/components/base/TopNav';
import { ActiveStreamBanner } from '@/components/cameras/ActiveStreamBanner';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/context/auth';
import { StreamSessionProvider } from '@/context/StreamSessionProvider';
import { useStreamSession } from '@/context/streamSession';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';
import { useEffectiveColorScheme, useSystemColorScheme } from '@/context/themeMode';
import { saveProductMutationFn } from '@/features/products/queries';
import { createNavigationThemes, getAppTheme } from '@/theme';
import { AppThemeProvider } from '@/theme/AppThemeProvider';
import { type BackgroundOverlay, useBackgroundOverlay } from '@/utils/router/background';
import { getUsernameOnboardingRedirect } from '@/utils/router/onboarding';

// TODO: wire onlineManager to NetInfo for the native phase
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 s; products are fresh for 30 s
      retry: 1,
    },
  },
});

// A mutation restored from the persisted cache (after a reload) is dehydrated
// down to its key + variables — the mutationFn itself can't survive
// (de)serialization. Registering it here by mutationKey is how TanStack's
// persist-mutations pattern re-attaches a working function before
// resumePausedMutations() (see Providers' onSuccess below) runs it.
queryClient.setMutationDefaults(['saveProduct'], { mutationFn: saveProductMutationFn });

// This file can only export components (Fast Refresh), so the key isn't
// exported — AuthProvider duplicates the literal to clear it on sign-out.
// Keep the two in sync if this ever changes.
const QUERY_CACHE_STORAGE_KEY = 'relab-query-cache';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
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
        // Hero routes: calm the band behind the centred content column but let
        // the backdrop stay vivid at the edges, so it still reads as a photo.
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

// The root stack holds what sits *outside* the tabs: the entry redirect, the
// auth group, and the two screens that present over a tab (the category picker
// and a public profile). Each tab's own screens are declared by its group
// layout under (tabs)/.
//
// memo: AppShell re-renders on every route change and stream-telemetry tick,
// and this rebuilds every screen's options object and header renderer. Nothing
// here depends on props or state, so memo bails on all of it.
export const AppStack = memo(function AppStack() {
  const router = useRouter();
  // Cross-navigator target: a replace from this root screen would swap the
  // whole (tabs) route out for a fresh one, resetting every tab's trail.
  // navigate() returns to the tabs already on the stack instead.
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

  // On native there's no document/visibilitychange, so TanStack's focus
  // manager reports always-focused and refetch intervals (camera telemetry,
  // stream status) keep firing while the app is backgrounded. Drive focus from
  // AppState so polling pauses in the background and resumes on return.
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
    </View>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: 'v1' }}
      // Restoring only repopulates the caches; paused mutations (a capture
      // POST that was mid-offline at reload) stay paused until something
      // asks them to run. onlineManager gates the actual network call, so
      // this is a no-op while still offline.
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

// Derived from module constants only, so build the pair once rather than per render.
const { LightTheme, DarkTheme } = createNavigationThemes();

/** Inner providers that depend on the resolved theme mode. */
function ThemedProviders({ children }: { children: ReactNode }) {
  const colorScheme = useEffectiveColorScheme();
  const systemColorScheme = useSystemColorScheme();

  // Keep NativeWind's (react-native-css) color scheme in sync with the app's own
  // theme mode so `.dark:root` CSS variables (Task 2) apply to RNR components.
  // biome-ignore lint/correctness/useExhaustiveDependencies: systemColorScheme is unused in the body on purpose — see the dep array comment below.
  useEffect(() => {
    if (Platform.OS === 'web') {
      // react-native-css's setter routes through Appearance.setColorScheme,
      // which react-native-web doesn't implement; drive the CSS hooks directly.
      document.documentElement.classList.toggle('dark', colorScheme === 'dark');
      document.documentElement.dataset.theme = colorScheme;
      return;
    }
    // react-native-css@3.0.7 also wires an Appearance listener that writes this
    // same colorScheme observable, so an OS scheme flip can silently overwrite a
    // user-forced theme after this effect last ran. Re-run on system changes too
    // (not just `colorScheme`) so a forced theme gets re-asserted afterwards.
    nativewindColorScheme.set(colorScheme);
  }, [colorScheme, systemColorScheme]);

  return (
    <AppThemeProvider scheme={colorScheme}>
      <ThemeProvider value={colorScheme === 'light' ? LightTheme : DarkTheme}>
        <KeyboardProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <DialogProvider>{children}</DialogProvider>
          </GestureHandlerRootView>
        </KeyboardProvider>
      </ThemeProvider>
    </AppThemeProvider>
  );
}
