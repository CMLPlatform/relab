import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { AUTH_HERO_PATHS } from '@/constants';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { type Destination, useVisibleDestinations } from '@/navigation/destinations';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { BrandHeaderTitle } from './BrandHeaderTitle';
import { HeaderRightPill } from './HeaderRightPill';

// Full-bleed, chrome-free routes (AppStack's own headerShown: false list in
// _layout.tsx) — splash and the auth flow already opt out of the stack
// header, so the persistent top bar shouldn't layer on top of them either.
// Concretely: it was duplicating "Sign in" with the login form's own submit
// button.
//
// /mfa and /category-selection keep their own stack header (AppStack doesn't
// hide it for them), so TopNav suppresses itself there too — otherwise lg
// shows both bars, and on /mfa the Products/Cameras links let a keyboard user
// tab away mid login-challenge.
const NO_CHROME_PATHS = new Set<string>(['/', '/category-selection', ...AUTH_HERO_PATHS]);

function TopNavDestinationItem({
  destination,
  active,
  onPress,
}: {
  destination: Destination;
  active: boolean;
  onPress: (href: Destination['href']) => void;
}) {
  const handlePress = useCallback(() => onPress(destination.href), [onPress, destination.href]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={active ? `${destination.label}, current page` : destination.label}
      className={cn(
        'min-h-11 justify-center rounded-full px-4 py-2',
        active ? 'bg-primary/10' : 'opacity-70',
        Platform.select({
          web: 'cursor-pointer outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring',
        }),
      )}
    >
      <AppText variant="label" className={cn(active && 'text-primary')}>
        {destination.label}
      </AppText>
    </Pressable>
  );
}

/**
 * Slim persistent top bar shown on desktop web (>=lg) only. Phone and native
 * keep today's stack headers untouched — see PRIMARY_DESTINATIONS for the
 * sidebar-vs-topnav rationale.
 */
export function TopNav() {
  const { isLg } = useBreakpoint();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useAppTheme();
  const destinations = useVisibleDestinations();
  const goToProducts = useCallback(() => router.push('/products'), [router]);
  const goToDestination = useCallback((href: Destination['href']) => router.push(href), [router]);

  if (!(Platform.OS === 'web' && isLg) || NO_CHROME_PATHS.has(pathname)) return null;

  return (
    <View className="border-border bg-background flex-row items-center gap-1 border-b px-4 py-2">
      <Pressable
        onPress={goToProducts}
        accessibilityRole="button"
        accessibilityLabel="Relab, go to products"
        className={cn(
          'min-h-11 justify-center',
          Platform.select({
            web: 'cursor-pointer outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring',
          }),
        )}
      >
        <BrandHeaderTitle isDark={theme.scheme === 'dark'} />
      </Pressable>
      <View className="flex-row gap-1 pl-4">
        {destinations.map((destination) => (
          <TopNavDestinationItem
            key={destination.key}
            destination={destination}
            active={pathname === destination.href || pathname.startsWith(`${destination.href}/`)}
            onPress={goToDestination}
          />
        ))}
      </View>
      <View className="ml-auto">
        <HeaderRightPill />
      </View>
    </View>
  );
}
