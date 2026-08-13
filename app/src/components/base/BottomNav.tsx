import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TAP_TARGET } from '@/constants';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { type Tab, tabRouteName, useBottomNavTabs, useBottomNavVisible } from './useBottomNav';

function BottomNavTab({
  tab,
  active,
  onPress,
}: {
  tab: Tab;
  active: boolean;
  onPress: (key: string) => void;
}) {
  const theme = useAppTheme();
  const handlePress = useCallback(() => onPress(tab.key), [onPress, tab.key]);
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
 * The `tabBar` of the (tabs) navigator: Products / Cameras / Account. TopNav
 * owns >=lg web; this bar owns everything else (native always, web below lg),
 * on every screen inside a tab — including detail screens, so a tab is always
 * one tap away. Flat & sharp: hairline top border, no elevation.
 *
 * Navigating by route name (not href) is what makes a tab switch return to that
 * tab's preserved trail instead of resetting it to the tab's root screen.
 */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const tabs = useBottomNavTabs();
  const visible = useBottomNavVisible();
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;
  const goTo = useCallback((key: string) => navigation.navigate(tabRouteName(key)), [navigation]);

  if (!visible) return null;

  return (
    <View
      className="flex-row border-t border-border bg-background"
      style={{ paddingBottom: insets.bottom }}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => (
        <BottomNavTab
          key={tab.key}
          tab={tab}
          active={activeRoute === tabRouteName(tab.key)}
          onPress={goTo}
        />
      ))}
    </View>
  );
}
