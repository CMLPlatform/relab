import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/base/Card';
import { Skeleton } from '@/components/base/Skeleton';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';

export default function ProductCardSkeleton() {
  const theme = useAppTheme();
  const bg = theme.colors.surfaceVariant;

  return (
    <Card className="mx-2.5 my-1.5">
      {/* Mirrors ProductCard's structure, including the metadata row below the
          press target. When the card grew that row and this did not, every
          products-list load reflowed ~44px per card — several hundred pixels
          across a screenful, on the app's home surface. Keep the two in step. */}
      <View className="p-3">
        <View className="flex-row items-center">
          <Skeleton style={[styles.thumbnail, { backgroundColor: bg }]} />
          <View className="flex-1 gap-2">
            <Skeleton style={[styles.titleLine, { backgroundColor: bg }]} />
            <Skeleton style={[styles.subtitleLine, { backgroundColor: bg }]} />
            <Skeleton style={[styles.descLine, { backgroundColor: bg }]} />
          </View>
        </View>
        <View className="pl-24" style={styles.metadataRow}>
          <Skeleton style={[styles.metaLine, { backgroundColor: bg }]} />
        </View>
      </View>
    </Card>
  );
}

// Skeleton wraps reanimated's Animated.View, which takes className as a
// silent no-op — these stay style-driven.
const styles = StyleSheet.create({
  metadataRow: {
    marginTop: 6,
  },
  metaLine: {
    height: 14,
    width: 140,
    borderRadius: radius.control,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.card,
    marginRight: 16,
  },
  titleLine: {
    height: 18,
    borderRadius: radius.control,
    width: '60%',
  },
  subtitleLine: {
    height: 13,
    borderRadius: radius.control,
    width: '40%',
  },
  descLine: {
    height: 13,
    borderRadius: radius.control,
    width: '85%',
  },
});
