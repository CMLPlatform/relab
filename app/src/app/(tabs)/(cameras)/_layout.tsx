import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/** Cameras tab stack: list, pairing and camera detail. */
export default function CamerasTabLayout() {
  const router = useRouter();
  const { isLg } = useBreakpoint();
  // Same-stack target, so replace is safe.
  const goToCameras = useCallback(() => router.replace('/cameras'), [router]);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' }, headerShown: !isLg }}>
      {/* TopNav replaces every stack header on >=lg web; add and detail render a PageHeaderRow there. */}
      <Stack.Screen name="cameras/index" options={{ title: 'My cameras' }} />
      <Stack.Screen
        name="cameras/add"
        options={{
          title: 'Add camera',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToCameras} />,
        }}
      />
      <Stack.Screen
        name="cameras/[id]"
        options={{
          title: 'Camera',
          headerLeft: (props) => <HeaderBackButton {...props} onPress={goToCameras} />,
        }}
      />
    </Stack>
  );
}
