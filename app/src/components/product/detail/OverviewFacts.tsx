import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { PRESS_TINT } from '@/components/base/pressFeedback';
import { Skeleton } from '@/components/base/Skeleton';
import { type SpecFact, SpecFacts } from '@/components/base/SpecFacts';
import { CpvTypeLoadError } from '@/components/product/CPVCard';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { useCpvType } from '@/features/products/useCpvType';
import { useAppTheme } from '@/theme/appThemeContext';
import { type Product, typeRowLabels } from '@/types/Product';

function ViewProductsOfTypeLink({ typeName, onPress }: { typeName: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      className={PRESS_TINT}
      style={styles.link}
      onPress={onPress}
      // Navigates to the filtered list: a link, not an action on this page.
      accessibilityRole="link"
      accessibilityLabel={`View all products of type ${typeName}`}
    >
      <AppText variant="caption" className="text-right" style={{ color: colors.primary }}>
        View all
      </AppText>
      <Icon size="md" name="chevron-right" color={colors.primary} />
    </Pressable>
  );
}

/**
 * View-mode Overview facts: brand, model, amount and type in one Spec Row, with the
 * type's description and a link to its other products under it. Edit mode uses the
 * chips (ProductTags) and the type card (ProductType) instead: those are controls.
 */
export function OverviewFacts({ product }: { product: Product }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const cpvType = useCpvType(product.productTypeID, product.productType);

  const facts: SpecFact[] = [
    { label: 'Brand', value: product.brand || '—' },
    { label: 'Model', value: product.model || '—' },
  ];
  if (product.role === 'component') {
    facts.push({ label: 'Amount', value: String(product.amountInParent ?? 1) });
  }
  const hasType = product.productTypeID !== undefined;
  // The type fact is there from the first frame, pulsing while it resolves, so
  // nothing pops in under the row.
  if (hasType && cpvType.status !== 'error') {
    facts.push({
      label: typeRowLabels(product.role).title,
      value: cpvType.status === 'ready' ? cpvType.type.name : '',
      loading: cpvType.status !== 'ready',
    });
  }

  const typeName = product.productTypeName;
  // Filters the list by type name, the value screenData.ts's `types` param reads.
  const onViewAllOfType = useCallback(() => {
    if (typeName) router.push({ pathname: '/products', params: { types: typeName } });
  }, [router, typeName]);

  return (
    <View className="my-3 gap-1">
      <SpecFacts facts={facts} />
      {hasType && cpvType.status === 'error' && product.productTypeID !== undefined ? (
        <CpvTypeLoadError typeID={product.productTypeID} retry={cpvType.retry} />
      ) : null}
      {hasType && cpvType.status !== 'error' ? (
        <View className="min-h-11 flex-row items-center gap-2">
          {cpvType.status === 'ready' ? (
            <AppText variant="caption" className="flex-1 text-muted-foreground">
              {cpvType.type.description}
            </AppText>
          ) : (
            <View className="flex-1">
              <Skeleton
                testID="type-description-skeleton"
                style={[styles.captionSkeleton, { backgroundColor: colors.muted }]}
              />
            </View>
          )}
          {typeName ? (
            <ViewProductsOfTypeLink typeName={typeName} onPress={onViewAllOfType} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  // Skeleton wraps Animated.View, which ignores className. Caption line height.
  captionSkeleton: {
    width: '60%',
    height: 18,
    borderRadius: radius.control,
  },
});
