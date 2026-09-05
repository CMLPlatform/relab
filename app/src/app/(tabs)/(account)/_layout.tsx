import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Account tab stack. A one-screen stack rather than a header on the tab
 * navigator itself, so the screen keeps the same native stack header as every
 * other tab (and HeaderBackButton keeps its native-stack prop type).
 */
export default function AccountTabLayout() {
  const router = useRouter();
  const { isLg } = useBreakpoint();
  // Cross-tab target: a replace would resolve above the tab navigator and swap
  // the whole thing out, resetting every tab's trail. navigate() jumps to the
  // products tab and shows its list, which is what this arrow has always meant.
  const goToProducts = useCallback(() => router.navigate('/products'), [router]);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      {/* TopNav covers this screen on >=lg web. */}
      <Stack.Screen
        name="account/index"
        options={{
          title: 'Account',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToProducts} />,
          headerShown: !isLg,
        }}
      />
    </Stack>
  );
}
