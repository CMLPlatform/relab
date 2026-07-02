import { ImageBackground } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useEffectiveColorScheme } from '@/context/themeMode';

export function AnimatedBackground() {
  const colorScheme = useEffectiveColorScheme();

  const image =
    colorScheme === 'light'
      ? require('@/assets/images/bg-light.jpg')
      : require('@/assets/images/bg-dark.jpg');

  return <ImageBackground source={image} style={StyleSheet.absoluteFill} />;
}
