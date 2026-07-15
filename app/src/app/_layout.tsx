// biome-ignore lint/style/noRestrictedImports: global.css lives at the app root (outside src/), so it has no '@/' alias path.
import '../../global.css';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { memo, type ReactNode, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus, Platform, View } from 'react-native';
import { colorScheme as nativewindColorScheme } from 'react-native-css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PaperProvider } from 'react-native-paper';
import { BrandHeaderTitle } from '@/components/base/BrandHeaderTitle';
import { DialogProvider } from '@/components/base/DialogProvider';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { StaticBackground } from '@/components/base/StaticBackground';
import { TopNav } from '@/components/base/TopNav';
import { ActiveStreamBanner } from '@/components/cameras/ActiveStreamBanner';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/context/auth';
import { StreamSessionProvider } from '@/context/StreamSessionProvider';
import { useStreamSession } from '@/context/streamSession';
import { ThemeModeProvider } from '@/context/ThemeModeProvider';
import { useEffectiveColorScheme, useSystemColorScheme } from '@/context/themeMode';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useGlobalDialogA11y } from '@/hooks/useGlobalDialogA11y';
import { createNavigationThemes, getAppTheme } from '@/theme';
import { AppThemeProvider } from '@/theme/AppThemeProvider';
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

// memo: AppShell re-renders on every route change and stream-telemetry tick, and
// this rebuilds every screen's options object and header renderer. Bail unless
// isDark or isLg changes. Both are plain props on AppStack — React.memo's default
// shallow-prop compare already covers isLg without a custom comparator, but it
// only works if isLg keeps being passed as an actual prop; don't move this back
// to reading useBreakpoint() from inside a component the memo doesn't see.
export const AppStack = memo(function AppStack({
  isDark,
  isLg,
}: {
  isDark: boolean;
  isLg: boolean;
}) {
  const router = useRouter();
  const theme = getAppTheme(isDark ? 'dark' : 'light');
  const goToProducts = useCallback(() => router.replace('/products'), [router]);
  const goToCameras = useCallback(() => router.replace('/cameras'), [router]);
  // TopNav (mounted in AppShell) already covers these on >=lg web, so the stack's
  // own header would just duplicate it. Every other screen keeps its header.
  const hideForTopNav = isLg;
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="products/index"
        options={{
          title: 'ReLab',
          headerTitle: () => <BrandHeaderTitle isDark={isDark} />,
          ...getProductsHeaderStyle(theme),
          headerRight: () => <HeaderRightPill />,
          headerLeft: () => null,
          headerShown: !hideForTopNav,
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          title: 'Account',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToProducts} />,
          headerShown: !hideForTopNav,
        }}
      />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/new-account" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/mfa" options={{ title: 'Two-step verification' }} />
      <Stack.Screen name="category-selection" options={{ title: 'Select category' }} />
      <Stack.Screen
        name="cameras/index"
        options={{ title: 'My cameras', headerShown: !hideForTopNav }}
      />
      <Stack.Screen
        name="cameras/add"
        options={{
          title: 'Add camera',
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
});

function AppShell() {
  const colorScheme = useEffectiveColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const isDark = colorScheme === 'dark';
  const theme = getAppTheme(colorScheme);
  const { user, isLoading: authLoading } = useAuth();
  const { activeStream } = useStreamSession();
  const overlayColor = useBackgroundOverlayColor(isDark);
  const { isLg } = useBreakpoint();
  useGlobalDialogA11y();

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
      <TopNav />
      <AppStack isDark={isDark} isLg={isLg} />
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

// Derived from module constants only, so build the pair once rather than per render.
const { LightTheme, DarkTheme } = createNavigationThemes();

/** Inner providers that depend on the resolved theme mode. */
function ThemedProviders({ children }: { children: ReactNode }) {
  const colorScheme = useEffectiveColorScheme();
  const systemColorScheme = useSystemColorScheme();
  const theme = getAppTheme(colorScheme);

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

  // AppThemeProvider wraps PaperProvider (not nested inside it): react-native-paper's
  // Portal (Dialog/Menu/Snackbar) renders its content via a PortalManager that is a
  // *sibling* of PaperProvider's normal children, not a descendant — so a provider
  // placed inside PaperProvider never reaches portaled content. Paper works around
  // this for its own theme by re-injecting it inside Portal (see Portal.tsx), but
  // that only covers Paper's context. Wrapping PaperProvider instead keeps
  // useAppTheme() correct for our own components (e.g. Text) rendered inside a
  // Paper Dialog, such as MfaDialogs.
  return (
    <AppThemeProvider scheme={colorScheme}>
      <PaperProvider theme={theme} settings={PAPER_SETTINGS}>
        <ThemeProvider value={colorScheme === 'light' ? LightTheme : DarkTheme}>
          <KeyboardProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <DialogProvider>{children}</DialogProvider>
            </GestureHandlerRootView>
          </KeyboardProvider>
        </ThemeProvider>
      </PaperProvider>
    </AppThemeProvider>
  );
}
