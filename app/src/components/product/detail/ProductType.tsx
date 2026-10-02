import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import { Icon } from '@/components/base/Icon';
import { PRESS_TINT } from '@/components/base/pressFeedback';
import CPVCard, { CpvTypeLoadError } from '@/components/product/CPVCard';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { useCpvType } from '@/features/products/useCpvType';
import { useAppTheme } from '@/theme/appThemeContext';
import { entityLabel, type Product, typeRowLabels } from '@/types/Product';

function ViewProductsOfTypeLink({ typeName, onPress }: { typeName: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      className={PRESS_TINT}
      style={styles.link}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View all products of type ${typeName}`}
    >
      <AppText variant="caption" className="text-right" style={{ color: colors.primary }}>
        View all
      </AppText>
      <Icon size="md" name="chevron-right" color={colors.primary} />
    </Pressable>
  );
}

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newType: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  // Hooks
  const router = useRouter();

  // Apply the type picked on the category-selection screen (see pendingTypeSelection.ts).
  useFocusEffect(
    useCallback(() => {
      const typeId = takePendingTypeSelection();
      if (typeId !== null) onTypeChange?.(typeId);
    }, [onTypeChange]),
  );

  // The snapshot is keyed by its own ids, which match the database's only by
  // construction order, so a recorded type is shown as the API returned it.
  // A type picked since load has only a snapshot id, so it is looked up.
  const cpvType = useCpvType(
    product.productTypeID,
    product.productType && {
      id: product.productType.id,
      name: product.productType.name,
      description: product.productType.description ?? '',
    },
  );

  // Callback
  const onTypeSelectionStart = () => {
    if (!editMode) return;
    router.push('/category-selection');
  };

  // Filters the products list by this type's name — the same value the list
  // reads back via screenData.ts's `types` param.
  const onViewAllOfType = () => {
    if (!product.productTypeName) return;
    router.push({ pathname: '/products', params: { types: product.productTypeName } });
  };

  const labels = typeRowLabels(product.role);

  const header = (
    <DetailSectionHeader
      title={labels.title}
      tooltipTitle={
        editMode ? `Select a fitting category for the ${entityLabel(product)}.` : undefined
      }
    />
  );

  // No type set: invite in edit mode, render nothing in view mode.
  if (product.productTypeID === undefined) {
    if (!editMode) return null;
    return (
      <View>
        {header}
        <AppButton
          variant="outline"
          className="w-full"
          accessibilityLabel={labels.choose}
          onPress={onTypeSelectionStart}
        >
          {labels.choose}
        </AppButton>
      </View>
    );
  }

  // Render
  return (
    <View>
      {header}
      {cpvType.status === 'error' ? (
        <CpvTypeLoadError typeID={product.productTypeID} retry={cpvType.retry} />
      ) : null}
      {cpvType.status === 'ready' ? (
        <CPVCard
          CPV={cpvType.type}
          onPress={editMode ? onTypeSelectionStart : undefined}
          actionElement={
            !editMode && product.productTypeName ? (
              <ViewProductsOfTypeLink
                typeName={product.productTypeName}
                onPress={onViewAllOfType}
              />
            ) : undefined
          }
        />
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
});
