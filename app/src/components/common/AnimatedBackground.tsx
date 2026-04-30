import { ImageBackground } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useEffectiveColorScheme } from '@/context/themeMode';

export function AnimatedBackground() {
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 20 });
  const colorScheme = useEffectiveColorScheme();

  const backgroundStyle = useAnimatedStyle(() => {
    const { pitch, roll } = rotation.sensor.value;
    return {
      transform: [
        { translateX: withSpring(-roll * 25, { damping: 250 }) },
        { translateY: withSpring(-pitch * 25, { damping: 250 }) },
        { scale: 1.1 },
      ],
    };
  });

  const image =
    colorScheme === 'light'
      ? require('@/assets/images/bg-light.jpg')
      : require('@/assets/images/bg-dark.jpg');

  if (Platform.OS === 'web') {
    return <ImageBackground source={image} style={StyleSheet.absoluteFill} />;
  }

  return (
    <Animated.Image
      source={image}
      resizeMode="cover"
      style={[
        { width: '110%', height: '110%', position: 'absolute', top: '-10%', left: '-10%' },
        backgroundStyle,
      ]}
    />
  );
}
