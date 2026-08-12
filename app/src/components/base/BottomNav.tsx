import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TAP_TARGET } from '@/constants';
import { useAuth } from '@/context/auth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useVisibleDestinations } from '@/navigation/destinations';
import { useAppTheme } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

const DESTINATION_ICONS: Record<string, IconName> = {
  products: 'package',
  cameras: 'camera',
};

type TabHref = '/products' | '/cameras' | '/account';

type Tab = {
  key: string;
  label: string;
  href: TabHref;
  icon: IconName;
};

function BottomNavTab({
  tab,
  active,
  onPress,
}: {
  tab: Tab;
  active: boolean;
  onPress: (href: TabHref) => void;
}) {
  const theme = useAppTheme();
  const handlePress = useCallback(() => onPress(tab.href), [onPress, tab.href]);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      onPress={handlePress}
      style={{ minHeight: MIN_TAP_TARGET }}
      className="flex-1 items-center justify-center gap-0.5 py-2"
    >
      <Icon
        name={tab.icon}
        size={22}
        color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
      />
      <AppText variant="label" className={active ? 'text-primary' : 'text-muted-foreground'}>
        {tab.label}
      </AppText>
    </Pressable>
  );
}

/**
 * Phone-width primary navigation: Products / Cameras / Account. TopNav owns
 * >=lg web; this bar owns everything else (native always, web below lg), and
 * only on the top-level destinations so detail screens keep their full
 * height. Flat & sharp: hairline top border, no elevation.
 */
export function BottomNav() {
  const { isLg } = useBreakpoint();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const destinations = useVisibleDestinations();
  const insets = useSafeAreaInsets();
  const goTo = useCallback((href: TabHref) => router.replace(href), [router]);

  const tabs: Tab[] = [
    ...destinations.map((d) => ({ ...d, icon: DESTINATION_ICONS[d.key] ?? 'package' })),
    ...(user
      ? [{ key: 'account', label: 'Account', href: '/account' as const, icon: 'user' as IconName }]
      : []),
  ];
  const isTopLevel = tabs.some((tab) => tab.href === pathname);
  if (isLg || !isTopLevel) return null;

  return (
    <View
      className="flex-row border-t border-border bg-background"
      style={{ paddingBottom: insets.bottom }}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => (
        <BottomNavTab key={tab.key} tab={tab} active={pathname === tab.href} onPress={goTo} />
      ))}
    </View>
  );
}
