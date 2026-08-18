import { Tabs } from 'expo-router/js-tabs';
import { BottomNav } from '@/components/base/BottomNav';

/**
 * The three primary destinations, one React Navigation tab each. Every tab is a
 * group segment holding its own Stack, so a tab keeps its navigation trail while
 * you are on another one — and group segments stay invisible to the URL, so
 * /products, /components/1, /cameras and /account are unchanged.
 *
 * The products tab owns both the /products and /components trees: a component is
 * a product's child, and cards, breadcrumbs and post-create redirects move
 * between the two constantly. Splitting them across navigators makes every such
 * hop a cross-navigator REPLACE, which React Navigation resolves by swapping the
 * whole tab navigator out — resetting every tab. They share one stack instead.
 *
 * `Tabs.Screen` order is what fixes the tab order (and therefore the initial
 * tab); the options themselves live in each group's own Stack layout.
 */
export default function TabsLayout() {
  return (
    <Tabs
      // Rendered as an element, not passed bare: React Navigation invokes `tabBar`
      // as a plain function, so a bare component's hooks would run outside a
      // component (React error #321) and crash every tab screen.
      tabBar={(props) => <BottomNav {...props} />}
      // Bottom tabs paint the scene from the navigation theme, which would sit
      // opaque over the app-wide StaticBackground. Same reasoning as the stacks'
      // transparent contentStyle.
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
    >
      <Tabs.Screen name="(products)" />
      <Tabs.Screen name="(cameras)" />
      <Tabs.Screen name="(account)" />
    </Tabs>
  );
}
