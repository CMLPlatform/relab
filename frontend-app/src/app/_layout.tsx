import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton } from '@react-navigation/elements';
import {
  DarkTheme as RNDark,
  DefaultTheme as RNLight,
  ThemeProvider,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useRouter } from 'expo-router';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  adaptNavigationTheme,
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
  useTheme,
} from 'react-native-paper';
import darkTheme from '@/assets/themes/dark';
import lightTheme from '@/assets/themes/light';
import { Text } from '@/components/base/Text';
import { DialogProvider } from '@/components/common/DialogProvider';
import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { ThemeModeProvider, useEffectiveColorScheme } from '@/context/ThemeModeProvider';

// Monkey-patch Animated to always use useNativeDriver: false on web.
// This silences warnings from third-party libraries (like react-native-paper)
// that might have hardcoded useNativeDriver: true.
if (Platform.OS === 'web') {
  const originalTiming = Animated.timing;
  Object.defineProperty(Animated, 'timing', {
    value: (
      value: Parameters<typeof Animated.timing>[0],
      config: Parameters<typeof Animated.timing>[1],
    ) => originalTiming(value, { ...config, useNativeDriver: false }),
    writable: true,
    configurable: true,
  });

  const originalSpring = Animated.spring;
  Object.defineProperty(Animated, 'spring', {
    value: (
      value: Parameters<typeof Animated.spring>[0],
      config: Parameters<typeof Animated.spring>[1],
    ) => originalSpring(value, { ...config, useNativeDriver: false }),
    writable: true,
    configurable: true,
  });

  const originalDecay = Animated.decay;
  Object.defineProperty(Animated, 'decay', {
    value: (
      value: Parameters<typeof Animated.decay>[0],
      config: Parameters<typeof Animated.decay>[1],
    ) => originalDecay(value, { ...config, useNativeDriver: false }),
    writable: true,
    configurable: true,
  });

  const originalEvent = Animated.event;
  Object.defineProperty(Animated, 'event', {
    value: (...args: Parameters<typeof originalEvent>) => {
      const [argMapping, config] = args;
      return originalEvent(argMapping, { ...config, useNativeDriver: false });
    },
    writable: true,
    configurable: true,
  });
}

// Routes that show the animated background but NOT the overlay
const NO_OVERLAY_PATHS = ['/login', '/new-account', '/onboarding'];
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 s; products are fresh for 30 s
      retry: 1,
    },
  },
});

export function HeaderRight() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const pill = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginRight: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
  };

  const primaryText = {
    color: theme.colors.onBackground,
    fontWeight: '600' as const,
    fontSize: 14,
  };

  if (user) {
    const username = user.username.length > 16 ? `${user.username.slice(0, 14)}…` : user.username;
    return (
      <Pressable
        onPress={() => router.push('/profile')}
        style={pill}
        accessibilityRole="button"
        accessibilityLabel={`Profile: ${username}`}
      >
        <MaterialCommunityIcons name="account-circle" size={18} color={theme.colors.onBackground} />
        <Text style={primaryText} numberOfLines={1}>
          {username}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push('/login')}
      style={pill}
      accessibilityRole="button"
      accessibilityLabel="Sign in"
    >
      <Text style={primaryText}>Sign In</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

function AppShell() {
  const colorScheme = useEffectiveColorScheme();
  const router = useRouter();
  const isDark = colorScheme === 'dark';
  const pathname = usePathname();
  const showBackground = true;
  const showOverlay = showBackground && !NO_OVERLAY_PATHS.some((p) => pathname.includes(p));
  const bgOverlay = isDark ? 'rgba(10,10,10,0.90)' : 'rgba(242,242,242,0.95)';
  const [BackgroundComponent, setBackgroundComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    setBackgroundColorAsync(isDark ? 'black' : 'white').catch(() => {
      // Best-effort only; the app can render fine without this on unsupported targets.
    });
  }, [isDark]);

  useEffect(() => {
    if (!showBackground || BackgroundComponent) return;

    let isMounted = true;

    import('@/components/common/AnimatedBackground').then((module) => {
      if (!isMounted) return;
      setBackgroundComponent(() => module.AnimatedBackground);
    });

    return () => {
      isMounted = false;
    };
  }, [BackgroundComponent]);

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
            backgroundColor: bgOverlay,
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
            headerTitleStyle: {
              fontWeight: 'bold',
              fontSize: 34,
              color: isDark ? darkTheme.colors.onBackground : lightTheme.colors.onBackground,
            },
            headerStyle: {
              backgroundColor: isDark
                ? darkTheme.colors.elevation.level2
                : lightTheme.colors.elevation.level2,
            },
            headerRight: () => <HeaderRight />,
            headerLeft: () => null,
          }}
        />

        <Stack.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerLeft: (props) => (
              <HeaderBackButton
                {...props}
                onPress={() => router.replace('/products')}
              />
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
              <HeaderBackButton
                {...props}
                onPress={() => router.replace('/cameras')}
              />
            ),
          }}
        />
        <Stack.Screen
          name="cameras/[id]"
          options={{
            title: 'Camera',
            headerLeft: (props) => (
              <HeaderBackButton
                {...props}
                onPress={() => router.replace('/cameras')}
              />
            ),
          }}
        />
      </Stack>
    </View>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeModeProvider>
          <ThemedProviders>{children}</ThemedProviders>
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
