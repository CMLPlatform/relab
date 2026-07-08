import { MaterialCommunityIcons } from '@expo/vector-icons';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { type ReactNode, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PaperProvider } from 'react-native-paper';
import { BrandHeaderTitle } from '@/components/base/BrandHeaderTitle';
import { DialogProvider } from '@/components/base/DialogProvider';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { StaticBackground } from '@/components/base/StaticBackground';
import { ActiveStreamBanner } from '@/components/cameras/ActiveStreamBanner';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/context/auth';
import { StreamSessionProvider } from '@/context/StreamSessionProvider';
import { useStreamSession } from '@/context/streamSession';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { createNavigationThemes, getAppTheme } from '@/theme';
import { useBackgroundOverlayColor } from '@/utils/router/background';
import { getUsernameOnboardingRedirect } from '@/utils/router/onboarding';
import { getProductsHeaderStyle } from '@/utils/router/styles';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 s; products are fresh for 30 s
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

export function HeaderRight() {
  return <HeaderRightPill />;
}

function AppBackground({ overlayColor }: { overlayColor: string }) {
  return (
    <>
      <StaticBackground />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: overlayColor,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

function AppStack({ isDark, router }: { isDark: boolean; router: ReturnType<typeof useRouter> }) {
  const theme = getAppTheme(isDark ? 'dark' : 'light');
  const goToProducts = useCallback(() => router.replace('/products'), [router]);
  const goToCameras = useCallback(() => router.replace('/cameras'), [router]);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="products/index"
        options={{
          title: 'RELab',
          headerTitle: () => <BrandHeaderTitle isDark={isDark} />,
          ...getProductsHeaderStyle(theme),
          headerRight: () => <HeaderRightPill />,
          headerLeft: () => null,
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          title: 'Account',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToProducts} />,
        }}
      />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/new-account" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/mfa" options={{ title: 'Two-step verification' }} />
      <Stack.Screen
        name="products/[id]/category-selection"
        options={{ title: 'Select Category' }}
      />
      <Stack.Screen name="cameras/index" options={{ title: 'My Cameras' }} />
      <Stack.Screen
        name="cameras/add"
        options={{
          title: 'Add Camera',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToCameras} />,
        }}
      />
      <Stack.Screen
        name="cameras/[id]"
        options={{
          title: 'Camera',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToCameras} />,
        }}
      />
    </Stack>
  );
}

function AppShell() {
  const colorScheme = useEffectiveColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const isDark = colorScheme === 'dark';
  const theme = getAppTheme(colorScheme);
  const { user, isLoading: authLoading } = useAuth();
  const { activeStream } = useStreamSession();
  const overlayColor = useBackgroundOverlayColor(isDark);

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
      <AppBackground overlayColor={overlayColor} />
      <AppStack isDark={isDark} router={router} />
      <ActiveStreamBanner />
    </View>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeModeProvider>
          <StreamSessionProvider>
            <ThemedProviders>{children}</ThemedProviders>
          </StreamSessionProvider>
        </ThemeModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Paper renders string-named icons as unlabeled role="img" on web, which trips
 * axe's role-img-alt on every decorative icon. Paper icons live inside labeled
 * controls (buttons, chips, list items) or beside text, so they're decorative —
 * mark them aria-hidden. Same Material Design Icons font the app already uses.
 */
const PAPER_SETTINGS = {
  icon: ({
    name,
    color,
    size,
    allowFontScaling,
  }: {
    name: string;
    color?: string;
    size: number;
    direction?: 'rtl' | 'ltr';
    testID?: string;
    allowFontScaling?: boolean;
  }) => (
    <MaterialCommunityIcons
      // biome-ignore lint/suspicious/noExplicitAny: @expo/vector-icons omits aria-* from its prop types but forwards them to the DOM on web.
      {...({ 'aria-hidden': true } as any)}
      name={name as keyof typeof MaterialCommunityIcons.glyphMap}
      color={color}
      size={size}
      allowFontScaling={allowFontScaling}
    />
  ),
};

/** Inner providers that depend on the resolved theme mode. */
function ThemedProviders({ children }: { children: ReactNode }) {
  const colorScheme = useEffectiveColorScheme();
  const theme = getAppTheme(colorScheme);
  const { LightTheme, DarkTheme } = createNavigationThemes();

  return (
    <PaperProvider theme={theme} settings={PAPER_SETTINGS}>
      <ThemeProvider value={colorScheme === 'light' ? LightTheme : DarkTheme}>
        <KeyboardProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <DialogProvider>{children}</DialogProvider>
          </GestureHandlerRootView>
        </KeyboardProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}
