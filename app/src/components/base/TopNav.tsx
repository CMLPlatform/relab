import { usePathname, useRouter } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { PRIMARY_DESTINATIONS } from '@/navigation/destinations';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { BrandHeaderTitle } from './BrandHeaderTitle';
import { HeaderRightPill } from './HeaderRightPill';

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

  if (!(Platform.OS === 'web' && isLg)) return null;

  return (
    <View className="border-border bg-background flex-row items-center gap-1 border-b px-4 py-2">
      <Pressable
        onPress={() => router.push('/products')}
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
        {PRIMARY_DESTINATIONS.map((destination) => {
          const active =
            pathname === destination.href || pathname.startsWith(`${destination.href}/`);
          return (
            <Pressable
              key={destination.key}
              onPress={() => router.push(destination.href)}
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
        })}
      </View>
      <View className="ml-auto">
        <HeaderRightPill />
      </View>
    </View>
  );
}
