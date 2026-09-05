import { ImageBackground } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';

export function StaticBackground() {
  const colorScheme = useEffectiveColorScheme();

  const image =
    colorScheme === 'light'
      ? require('@/assets/images/bg-light.jpg')
      : require('@/assets/images/bg-dark.jpg');

  // Purely decorative: hide from the accessibility tree so screen readers and
  // axe skip the underlying <img> (expo-image drops an empty alt="", so mark
  // the subtree aria-hidden instead).
  return (
    <View style={StyleSheet.absoluteFill} aria-hidden pointerEvents="none">
      <ImageBackground source={image} style={StyleSheet.absoluteFill} />
    </View>
  );
}
