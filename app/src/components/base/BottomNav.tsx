import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TAP_TARGET } from '@/constants';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { type Tab, type TabHref, useBottomNavTabs, useBottomNavVisible } from './useBottomNav';

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
      className={cn(
        'flex-1 items-center justify-center gap-0.5 py-2 active:opacity-60',
        Platform.select({
          web: 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
        }),
      )}
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
  const pathname = usePathname();
  const router = useRouter();
  const tabs = useBottomNavTabs();
  const visible = useBottomNavVisible();
  const insets = useSafeAreaInsets();
  const goTo = useCallback((href: TabHref) => router.replace(href), [router]);

  if (!visible) return null;

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
