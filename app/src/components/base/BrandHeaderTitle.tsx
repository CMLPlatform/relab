import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

// The R9lab wordmark for the nav header, theme-swapped so it stays legible on
// both light and dark headers.
export function BrandHeaderTitle({ isDark }: { isDark: boolean }) {
  const source = isDark
    ? require('@/assets/images/wordmark-dark.png')
    : require('@/assets/images/wordmark.png');
  return (
    <Image
      source={source}
      style={styles.wordmark}
      contentFit="contain"
      accessibilityLabel="ReLab"
    />
  );
}

const styles = StyleSheet.create({
  wordmark: {
    height: 30,
    width: 72,
  },
});
