import { ImageBackground } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';

// Decorative teardown photo. Only the auth group and empty states mount it;
// content screens sit on the plain theme background.
export function StaticBackground({ scrim }: { scrim?: string } = {}) {
  const colorScheme = useEffectiveColorScheme();

  // TODO: re-encode bg-light/bg-dark to WebP at their source in the repo-root assets/images
  // (copied here by scripts/sync_brand_assets.py) to cut roughly 200 KB.
  const image =
    colorScheme === 'light'
      ? require('@/assets/images/bg-light.jpg')
      : require('@/assets/images/bg-dark.jpg');

  // Decorative. expo-image drops an empty alt="", so hide the subtree instead.
  return (
    <View style={StyleSheet.absoluteFill} aria-hidden pointerEvents="none">
      <ImageBackground
        source={image}
        // NOTE: decorative, so on web it must not compete with the scripts and data the page needs.
        priority={Platform.OS === 'web' ? 'low' : undefined}
        style={StyleSheet.absoluteFill}
        // A photograph, not an icon: iOS Smart Invert would render it as a colour negative.
        accessibilityIgnoresInvertColors
      />
      {scrim ? <View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} /> : null}
    </View>
  );
}
