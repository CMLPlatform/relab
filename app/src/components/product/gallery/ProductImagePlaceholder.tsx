import { View } from 'react-native';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { IMAGE_HEIGHT } from './shared';

export function ProductImagePlaceholder({ width, label }: { width: number; label: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <ImagePlaceholder
        width={width}
        height={IMAGE_HEIGHT}
        label={label}
        testID="image-placeholder"
      />
    </View>
  );
}
