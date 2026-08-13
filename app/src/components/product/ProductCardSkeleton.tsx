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
      <View className="flex-row items-center p-3">
        <Skeleton style={[styles.thumbnail, { backgroundColor: bg }]} />
        <View className="flex-1 gap-2">
          <Skeleton style={[styles.titleLine, { backgroundColor: bg }]} />
          <Skeleton style={[styles.subtitleLine, { backgroundColor: bg }]} />
          <Skeleton style={[styles.descLine, { backgroundColor: bg }]} />
        </View>
      </View>
    </Card>
  );
}

// Skeleton wraps reanimated's Animated.View, which takes className as a
// silent no-op — these stay style-driven.
const styles = StyleSheet.create({
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
