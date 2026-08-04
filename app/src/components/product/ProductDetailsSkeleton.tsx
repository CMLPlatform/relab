import { ScrollView, StyleSheet, View } from 'react-native';
import { Card } from '@/components/base/Card';
import { Skeleton } from '@/components/base/Skeleton';
import { radius, spacing } from '@/constants';
import { useAppTheme } from '@/theme';

/**
 * Loading placeholder mirroring the detail layout (Content.tsx): a full-bleed
 * gallery, the SpecHeader identity block (name + a couple of facts), then a few
 * titled section cards.
 */
export default function ProductDetailsSkeleton() {
  const theme = useAppTheme();
  const bg = theme.colors.surfaceVariant;

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
      {/* Full-bleed image gallery */}
      <Skeleton style={[styles.gallery, { backgroundColor: bg }]} />

      {/* SpecHeader: name + a couple of fact lines */}
      <View style={styles.specHeader}>
        <Skeleton style={[styles.name, { backgroundColor: bg }]} />
        <Skeleton style={[styles.fact, { backgroundColor: bg }]} />
        <Skeleton style={[styles.fact, { backgroundColor: bg, width: '40%' }]} />
      </View>

      {/* A few titled section cards */}
      {[1, 2, 3].map((n) => (
        <View key={n} style={styles.section}>
          <Skeleton style={[styles.sectionTitle, { backgroundColor: bg }]} />
          <Card className="mx-3.5 px-3 pt-1.5 pb-1.5">
            <View style={styles.cardContent}>
              <Skeleton style={[styles.line, { backgroundColor: bg }]} />
              <Skeleton style={[styles.line, { backgroundColor: bg, width: '90%' }]} />
            </View>
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 15,
    paddingBottom: 20,
  },
  gallery: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  specHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 8,
  },
  name: {
    height: 28,
    borderRadius: radius.sm,
    width: '70%',
  },
  fact: {
    height: 14,
    borderRadius: radius.sm,
    width: '55%',
  },
  section: {
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  sectionTitle: {
    height: 18,
    borderRadius: radius.sm,
    width: '35%',
  },
  cardContent: {
    gap: 12,
  },
  line: {
    height: 16,
    borderRadius: radius.sm,
    width: '100%',
  },
});
