import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { type ComponentType, useEffect, useState } from 'react';
import { Animated, Platform, Pressable } from 'react-native';
import { useTheme } from 'react-native-paper';
import darkTheme from '@/assets/themes/dark';
import lightTheme from '@/assets/themes/light';
import { Text } from '@/components/base/Text';
import { useAuth } from '@/context/AuthProvider';

const NO_OVERLAY_PATHS = ['/login', '/new-account', '/onboarding'];
let animatedPatchApplied = false;

export function ensureWebAnimatedPatch() {
  if (Platform.OS !== 'web' || animatedPatchApplied) return;

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

  animatedPatchApplied = true;
}

export function useAnimatedBackground(isDark: boolean) {
  const pathname = usePathname();
  const showBackground = true;
  const showOverlay = showBackground && !NO_OVERLAY_PATHS.some((path) => pathname.includes(path));
  const overlayColor = isDark ? 'rgba(10,10,10,0.90)' : 'rgba(242,242,242,0.95)';
  const [BackgroundComponent, setBackgroundComponent] = useState<ComponentType | null>(null);

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

  return {
    BackgroundComponent,
    overlayColor,
    showBackground,
    showOverlay,
  };
}

export function HeaderRightPill() {
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

export function getProductsHeaderStyle(isDark: boolean) {
  return {
    headerTitleStyle: {
      fontWeight: 'bold' as const,
      fontSize: 34,
      color: isDark ? darkTheme.colors.onBackground : lightTheme.colors.onBackground,
    },
    headerStyle: {
      backgroundColor: isDark
        ? darkTheme.colors.elevation.level2
        : lightTheme.colors.elevation.level2,
    },
  };
}
