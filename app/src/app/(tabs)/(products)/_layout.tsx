import { Stack } from 'expo-router';
import { BrandHeaderTitle } from '@/components/base/BrandHeaderTitle';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getAppTheme } from '@/theme';
import { getProductsHeaderStyle } from '@/utils/router/styles';

/**
 * Products tab stack: the /products tree plus the /components tree it links
 * into (see (tabs)/_layout.tsx for why they share a navigator). Screens with a
 * dynamic title (product/component detail) declare it inline via
 * navigation.setOptions instead of here.
 */
export default function ProductsTabLayout() {
  const colorScheme = useEffectiveColorScheme();
  const { isLg } = useBreakpoint();
  const theme = getAppTheme(colorScheme);
  // TopNav already covers the products list on >=lg web, so the stack's own
  // header would just duplicate it. Every other screen keeps its header.
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen
        name="products/index"
        options={{
          title: 'Relab',
          headerTitle: () => <BrandHeaderTitle isDark={colorScheme === 'dark'} />,
          ...getProductsHeaderStyle(theme),
          headerRight: () => <HeaderRightPill />,
          headerLeft: () => null,
          headerShown: !isLg,
        }}
      />
      <Stack.Screen name="products/new" options={{ title: 'New product' }} />
      <Stack.Screen name="products/[id]/components/new" options={{ title: 'New component' }} />
      <Stack.Screen name="components/[id]/components/new" options={{ title: 'New component' }} />
    </Stack>
  );
}
