import { useEffect, useRef } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import DetailCard from '@/components/common/DetailCard';

function SkeletonBox({ style }: { style?: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View style={[{ opacity }, style]} />;
}

export default function ProductDetailsSkeleton() {
  const theme = useTheme();
  const bg = theme.colors.surfaceVariant;

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
      {/* Image Gallery Placeholder */}
      <SkeletonBox style={[styles.imageGallery, { backgroundColor: bg }]} />

      {/* Description Placeholder */}
      <DetailCard>
        <View style={styles.content}>
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg }]} />
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg }]} />
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg, width: '90%' }]} />
        </View>
      </DetailCard>

      {/* Tags Placeholder (Brand & Model) */}
      <View style={styles.tagRow}>
        <SkeletonBox style={[styles.chip, { backgroundColor: bg, width: 80 }]} />
        <SkeletonBox style={[styles.chip, { backgroundColor: bg, width: 100 }]} />
      </View>

      {/* Product Type Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Type or Material</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg, height: 40 }]} />
        </View>
      </DetailCard>

      {/* Properties Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Physical Properties</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <View style={styles.propertyRow}>
            <SkeletonBox style={[styles.propertyLabel, { backgroundColor: bg }]} />
            <SkeletonBox style={[styles.propertyValue, { backgroundColor: bg }]} />
          </View>
          <View style={styles.propertyRow}>
            <SkeletonBox style={[styles.propertyLabel, { backgroundColor: bg }]} />
            <SkeletonBox style={[styles.propertyValue, { backgroundColor: bg }]} />
          </View>
        </View>
      </DetailCard>

      {/* Circularity Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Circularity Properties</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg }]} />
        </View>
      </DetailCard>

      {/* Components Placeholder */}
      <View style={styles.sectionHeader}>
        <Text style={styles.actualTitle}>Components</Text>
      </View>
      <DetailCard>
        <View style={styles.content}>
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg, height: 60 }]} />
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
    borderRadius: 4,
    width: '100%',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  chip: {
    height: 32,
    borderRadius: 16,
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
    borderRadius: 4,
    width: '30%',
  },
  propertyValue: {
    height: 14,
    borderRadius: 4,
    width: '20%',
  },
});
