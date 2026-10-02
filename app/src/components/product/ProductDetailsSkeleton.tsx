import { ScrollView, StyleSheet, View } from 'react-native';
import { Card } from '@/components/base/Card';
import { Skeleton } from '@/components/base/Skeleton';
import { IMAGE_HEIGHT } from '@/components/product/gallery/shared';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme/appThemeContext';

/** Loading placeholder mirroring the detail layout (Content.tsx). */
export default function ProductDetailsSkeleton() {
  const theme = useAppTheme();
  const bg = theme.colors.muted;

  return (
    // Named and busy, like CenteredSpinner: the grey blocks alone say nothing to a screen reader.
    <ScrollView
      contentContainerClassName="gap-[15px] pb-5"
      scrollEnabled={false}
      accessible
      accessibilityRole="progressbar"
      aria-busy
      accessibilityLabel="Loading details"
    >
      {/* Full-bleed image gallery */}
      <Skeleton style={[styles.gallery, { backgroundColor: bg }]} />

      {/* SpecHeader: name + a couple of fact lines */}
      <View className="px-4 py-3 gap-2">
        <Skeleton style={[styles.name, { backgroundColor: bg }]} />
        <Skeleton style={[styles.fact, { backgroundColor: bg }]} />
        <Skeleton style={[styles.fact, { backgroundColor: bg, width: '40%' }]} />
      </View>

      {/* A few titled section cards */}
      {[1, 2, 3].map((n) => (
        <View key={n} className="px-4 gap-2.5">
          <Skeleton style={[styles.sectionTitle, { backgroundColor: bg }]} />
          <Card className="mx-3.5 px-3 pt-1.5 pb-1.5">
            <View className="gap-3">
              <Skeleton style={[styles.line, { backgroundColor: bg }]} />
              <Skeleton style={[styles.line, { backgroundColor: bg, width: '90%' }]} />
            </View>
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

// Skeleton wraps Animated.View, which ignores className.
const styles = StyleSheet.create({
  // The gallery's fixed height, not an aspect ratio: 16:9 drew a ~810px block at
  // 1440px wide and ~220px on a phone, against the 300px the images then took.
  gallery: {
    width: '100%',
    height: IMAGE_HEIGHT,
  },
  name: {
    height: 28,
    borderRadius: radius.control,
    width: '70%',
  },
  fact: {
    height: 14,
    borderRadius: radius.control,
    width: '55%',
  },
  sectionTitle: {
    height: 18,
    borderRadius: radius.control,
    width: '35%',
  },
  line: {
    height: 16,
    borderRadius: radius.control,
    width: '100%',
  },
});
