import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { PlainHeaderTitle } from '@/components/base/PlainHeaderTitle';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/** Account tab stack: one screen, so it keeps the same native stack header as every other tab. */
export default function AccountTabLayout() {
  const router = useRouter();
  const { isLg } = useBreakpoint();
  // Cross-tab target: replace() would reset every tab's trail.
  const goToProducts = useCallback(() => router.navigate('/products'), [router]);
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: 'transparent' },
        headerShown: !isLg,
        // The account screen renders the username as its h1.
        headerTitle: ({ children }) => <PlainHeaderTitle>{children}</PlainHeaderTitle>,
      }}
    >
      {/* TopNav covers this screen on >=lg web. */}
      <Stack.Screen
        name="account/index"
        options={{
          title: 'Account',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToProducts} />,
        }}
      />
    </Stack>
  );
}
