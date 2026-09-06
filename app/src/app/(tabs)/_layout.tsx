import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Tabs } from 'expo-router/js-tabs';
import { BottomNav } from '@/components/base/BottomNav';

// Rendered as an element: React Navigation calls `tabBar` as a plain function,
// so a bare component's hooks would run outside a component (React error #321).
function renderTabBar(props: BottomTabBarProps) {
  return <BottomNav {...props} />;
}

/**
 * The three primary destinations, one tab each. Every tab is a group segment
 * holding its own Stack, so it keeps its trail while another tab is active.
 *
 * The products tab owns both /products and /components: splitting them would
 * make every hop between them a cross-navigator REPLACE, which resets every tab.
 *
 * `Tabs.Screen` order fixes the tab order and the initial tab.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={renderTabBar}
      // The themed scene would sit opaque over StaticBackground.
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
    >
      <Tabs.Screen name="(products)" />
      <Tabs.Screen name="(cameras)" />
      <Tabs.Screen name="(account)" />
    </Tabs>
  );
}
