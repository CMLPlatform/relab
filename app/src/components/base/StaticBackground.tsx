import { ImageBackground } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';

// Decorative teardown photo. Only the auth group and empty states mount it;
// content screens sit on the plain theme background.
export function StaticBackground({ scrim }: { scrim?: string } = {}) {
  const colorScheme = useEffectiveColorScheme();

  const image =
    colorScheme === 'light'
      ? require('@/assets/images/bg-light.jpg')
      : require('@/assets/images/bg-dark.jpg');

  // Decorative. expo-image drops an empty alt="", so hide the subtree instead.
  return (
    <View style={StyleSheet.absoluteFill} aria-hidden pointerEvents="none">
      <ImageBackground source={image} style={StyleSheet.absoluteFill} />
      {scrim ? <View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} /> : null}
    </View>
  );
}
