import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/** Cameras tab stack: list, pairing and camera detail. */
export default function CamerasTabLayout() {
  const router = useRouter();
  const { isLg } = useBreakpoint();
  // Same-stack target, so this stays a replace: it resolves inside this
  // navigator and leaves the other tabs' trails alone.
  const goToCameras = useCallback(() => router.replace('/cameras'), [router]);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      {/* TopNav covers the list on >=lg web; the other screens always keep their header. */}
      <Stack.Screen name="cameras/index" options={{ title: 'My cameras', headerShown: !isLg }} />
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
