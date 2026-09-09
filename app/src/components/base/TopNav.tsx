import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { AUTH_HERO_PATHS, WEB_FOCUS_RING } from '@/constants';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { openShortcutsOverlay } from '@/hooks/useShortcutsOverlay';
import { type Destination, useVisibleDestinations } from '@/navigation/destinations';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { BrandHeaderTitle } from './BrandHeaderTitle';
import { HeaderRightPill } from './HeaderRightPill';
import { Icon } from './Icon';

// Routes where TopNav hides: the chrome-free splash/auth routes (AppStack's
// headerShown: false list), plus /mfa and /category-selection, which keep
// their stack header. On /mfa the links would also let a keyboard user tab
// away mid login-challenge.
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
        'min-h-11 justify-center rounded-md px-4 py-2',
        active ? 'bg-primary/12' : 'opacity-70',
        Platform.select({
          web: cn('cursor-pointer outline-none hover:opacity-90', WEB_FOCUS_RING),
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
 * Opens the shortcuts overlay for anyone who does not already know to press "?".
 *
 * Lives here rather than in the dialog: a control inside the thing it opens is no
 * control at all. TopNav is the only always-present chrome on the surface the shortcuts
 * apply to, which is desktop web.
 */
function ShortcutsButton() {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={openShortcutsOverlay}
      accessibilityRole="button"
      accessibilityLabel="Keyboard shortcuts"
      className={cn(
        'min-h-11 min-w-11 items-center justify-center rounded-md',
        Platform.select({
          web: cn('cursor-pointer outline-none hover:opacity-90', WEB_FOCUS_RING),
        }),
      )}
    >
      <Icon name="keyboard" size="md" color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

/** Slim persistent top bar for desktop web (>=lg) only; phone and native keep stack headers. */
export function TopNav() {
  const { isLg } = useBreakpoint();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useAppTheme();
  const destinations = useVisibleDestinations();
  // navigate(), not push(): from outside the tabs a push would stack a second
  // (tabs) navigator instead of returning to the live one.
  const goToProducts = useCallback(() => router.navigate('/products'), [router]);
  const goToDestination = useCallback(
    (href: Destination['href']) => router.navigate(href),
    [router],
  );

  if (!(Platform.OS === 'web' && isLg) || NO_CHROME_PATHS.has(pathname)) return null;

  return (
    <View
      role="banner"
      className="border-border bg-background flex-row items-center gap-1 border-b px-4 py-2"
    >
      <Pressable
        onPress={goToProducts}
        accessibilityRole="button"
        accessibilityLabel="Relab, go to products"
        className={cn(
          'min-h-11 justify-center',
          Platform.select({
            web: cn('cursor-pointer outline-none hover:opacity-90', WEB_FOCUS_RING),
          }),
        )}
      >
        <BrandHeaderTitle isDark={theme.scheme === 'dark'} />
      </Pressable>
      <View role="navigation" accessibilityLabel="Primary" className="flex-row gap-1 pl-4">
        {destinations.map((destination) => (
          <TopNavDestinationItem
            key={destination.key}
            destination={destination}
            active={pathname === destination.href || pathname.startsWith(`${destination.href}/`)}
            onPress={goToDestination}
          />
        ))}
      </View>
      <View className="ml-auto flex-row items-center gap-1">
        <ShortcutsButton />
        <HeaderRightPill />
      </View>
    </View>
  );
}
