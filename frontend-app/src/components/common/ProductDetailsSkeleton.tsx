import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Skeleton } from '@/components/base';
import DetailCard from '@/components/common/DetailCard';
import { radius, spacing } from '@/constants/layout';

export default function ProductDetailsSkeleton() {
  const theme = useTheme();
  const bg = theme.colors.surfaceVariant;

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
      {/* Image Gallery Placeholder */}
      <Skeleton style={[styles.imageGallery, { backgroundColor: bg }]} />

      {/* Description Placeholder */}
      <DetailCard>
        <View style={styles.content}>
          <Skeleton style={[styles.descLine, { backgroundColor: bg }]} />
          <Skeleton style={[styles.descLine, { backgroundColor: bg }]} />
          <Skeleton style={[styles.descLine, { backgroundColor: bg, width: '90%' }]} />
        </View>
      </DetailCard>

      {/* Tags Placeholder (Brand & Model) */}
      <View style={styles.tagRow}>
        <Skeleton style={[styles.chip, { backgroundColor: bg, width: 80 }]} />
        <Skeleton style={[styles.chip, { backgroundColor: bg, width: 100 }]} />
      </View>

      {/* Product Type Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Type or Material</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <Skeleton style={[styles.descLine, { backgroundColor: bg, height: 40 }]} />
        </View>
      </DetailCard>

      {/* Properties Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Physical Properties</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <View style={styles.propertyRow}>
            <Skeleton style={[styles.propertyLabel, { backgroundColor: bg }]} />
            <Skeleton style={[styles.propertyValue, { backgroundColor: bg }]} />
          </View>
          <View style={styles.propertyRow}>
            <Skeleton style={[styles.propertyLabel, { backgroundColor: bg }]} />
            <Skeleton style={[styles.propertyValue, { backgroundColor: bg }]} />
          </View>
        </View>
      </DetailCard>

      {/* Circularity Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Circularity Properties</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <Skeleton style={[styles.descLine, { backgroundColor: bg }]} />
        </View>
      </DetailCard>

      {/* Components Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Components</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <Skeleton style={[styles.descLine, { backgroundColor: bg, height: 60 }]} />
        </View>
      </DetailCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 0,
    gap: 15,
    paddingBottom: 20,
  },
  imageGallery: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  content: {
    gap: 12,
  },
  descLine: {
    height: 16,
    borderRadius: radius.sm,
    width: '100%',
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginVertical: 12,
    paddingHorizontal: spacing.md,
  },
  chip: {
    height: 32,
    borderRadius: radius.lg,
    width: 60,
  },
  sectionHeader: {
    paddingLeft: 14,
    marginTop: 8,
  },
  actualTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  propertyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  propertyLabel: {
    height: 14,
    borderRadius: radius.sm,
    width: '30%',
  },
  propertyValue: {
    height: 14,
    borderRadius: radius.sm,
    width: '20%',
  },
});
