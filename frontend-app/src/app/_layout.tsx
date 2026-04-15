import { HeaderBackButton } from '@react-navigation/elements';
import {
  DarkTheme as RNDark,
  DefaultTheme as RNLight,
  ThemeProvider,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { type ReactNode, useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  adaptNavigationTheme,
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
} from 'react-native-paper';
import {
  ensureWebAnimatedPatch,
  getProductsHeaderStyle,
  HeaderRightPill,
  useAnimatedBackground,
} from '@/app/layout/helpers';
import darkTheme from '@/assets/themes/dark';
import lightTheme from '@/assets/themes/light';
import { ActiveStreamBanner } from '@/components/common/ActiveStreamBanner';
import { DialogProvider } from '@/components/common/DialogProvider';
import { AuthProvider } from '@/context/AuthProvider';
import { StreamSessionProvider, useStreamSession } from '@/context/StreamSessionContext';
import { ThemeModeProvider, useEffectiveColorScheme } from '@/context/ThemeModeProvider';

ensureWebAnimatedPatch();
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

export const HeaderRight = HeaderRightPill;

function AppShell() {
  const colorScheme = useEffectiveColorScheme();
  const router = useRouter();
  const isDark = colorScheme === 'dark';
  const { activeStream } = useStreamSession();
  const { BackgroundComponent, overlayColor, showBackground, showOverlay } =
    useAnimatedBackground(isDark);

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
    setBackgroundColorAsync(isDark ? 'black' : 'white').catch(() => {
      // Best-effort only; the app can render fine without this on unsupported targets.
    });
  }, [isDark]);

  return (
    <View style={{ flex: 1 }}>
      {showBackground && BackgroundComponent ? <BackgroundComponent /> : null}
      {showOverlay && (
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
      )}
      <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="products/index"
          options={{
            title: 'RELab',
            ...getProductsHeaderStyle(isDark),
            headerRight: () => <HeaderRightPill />,
            headerLeft: () => null,
          }}
        />

        <Stack.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerLeft: (props) => (
              <HeaderBackButton {...props} onPress={() => router.replace('/products')} />
            ),
          }}
        />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/new-account" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />

        <Stack.Screen
          name="products/[id]/category_selection"
          options={{ title: 'Select Category' }}
        />

        <Stack.Screen
          name="cameras/index"
          options={{
            title: 'My Cameras',
          }}
        />
        <Stack.Screen
          name="cameras/add"
          options={{
            title: 'Add Camera',
            headerLeft: (props) => (
              <HeaderBackButton {...props} onPress={() => router.replace('/cameras')} />
            ),
          }}
        />
        <Stack.Screen
          name="cameras/[id]"
          options={{
            title: 'Camera',
            headerLeft: (props) => (
              <HeaderBackButton {...props} onPress={() => router.replace('/cameras')} />
            ),
          }}
        />
      </Stack>
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

/** Inner providers that depend on the resolved theme mode. */
function ThemedProviders({ children }: { children: ReactNode }) {
  const colorScheme = useEffectiveColorScheme();

  const theme =
    colorScheme === 'light'
      ? { ...MD3LightTheme, colors: lightTheme.colors }
      : { ...MD3DarkTheme, colors: darkTheme.colors };
  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: RNLight,
    reactNavigationDark: RNDark,
    materialLight: theme,
    materialDark: theme,
  });

  LightTheme.colors.background = 'transparent';
  DarkTheme.colors.background = 'transparent';

  return (
    <PaperProvider theme={theme}>
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
