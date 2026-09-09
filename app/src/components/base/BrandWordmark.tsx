import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';
import { useAppTheme } from '@/theme';

const LOGO_LIGHT = require('@/assets/images/logo.png');
const LOGO_DARK = require('@/assets/images/logo-dark.png');

/** Theme-matched brand logo, sized by the asset's aspect ratio; callers set a width. */
export function BrandWordmark({ style }: { style?: StyleProp<ImageStyle> }) {
  const theme = useAppTheme();
  const source = theme.dark ? LOGO_DARK : LOGO_LIGHT;
  const { width, height } = Asset.fromModule(source);
  return (
    <Image
      accessibilityIgnoresInvertColors
      source={source}
      contentFit="contain"
      accessibilityLabel="Relab"
      style={[width && height ? { aspectRatio: width / height } : null, style]}
    />
  );
}
