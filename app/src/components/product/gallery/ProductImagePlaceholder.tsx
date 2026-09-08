import { View } from 'react-native';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { IMAGE_HEIGHT } from './shared';

/** View-mode empty gallery: the name already sits in the header and title, so the slot says what it is. */
export function ProductImagePlaceholder({ width }: { width: number }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <ImagePlaceholder
        width={width}
        height={IMAGE_HEIGHT}
        label="No photos yet"
        // Full-bleed strip like the loaded gallery: a radius on a screen-wide slot reads as clipped corners.
        borderRadius={0}
        testID="image-placeholder"
      />
    </View>
  );
}
