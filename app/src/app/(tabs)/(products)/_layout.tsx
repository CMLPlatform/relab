import { Stack } from 'expo-router';
import { BrandHeaderTitle } from '@/components/base/BrandHeaderTitle';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getAppTheme } from '@/theme';
import { getProductsHeaderStyle } from '@/utils/router/styles';

/**
 * Products tab stack: the /products and /components trees (see (tabs)/_layout.tsx).
 * Detail screens set their dynamic title via navigation.setOptions.
 */
export default function ProductsTabLayout() {
  const colorScheme = useEffectiveColorScheme();
  const { isLg } = useBreakpoint();
  const theme = getAppTheme(colorScheme);
  // TopNav replaces every stack header on >=lg web; detail and capture screens
  // render their own PageHeaderRow there.
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' }, headerShown: !isLg }}>
      <Stack.Screen
        name="products/index"
        options={{
          title: 'Relab',
          headerTitle: () => <BrandHeaderTitle isDark={colorScheme === 'dark'} />,
          ...getProductsHeaderStyle(theme),
          headerRight: () => <HeaderRightPill />,
          headerLeft: () => null,
        }}
      />
      <Stack.Screen name="products/new" options={{ title: 'New product' }} />
      <Stack.Screen name="products/[id]/components/new" options={{ title: 'New component' }} />
      <Stack.Screen name="components/[id]/components/new" options={{ title: 'New component' }} />
    </Stack>
  );
}
