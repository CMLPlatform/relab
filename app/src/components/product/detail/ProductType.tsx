import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import CPVCard, { CpvTypeLoadError } from '@/components/product/CPVCard';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { useCpvType } from '@/features/products/useCpvType';
import { entityLabel, type Product, typeRowLabels } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newType: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  const router = useRouter();

  // Apply the type picked on the category-selection screen (see pendingTypeSelection.ts).
  useFocusEffect(
    useCallback(() => {
      const typeId = takePendingTypeSelection();
      if (typeId !== null) onTypeChange?.(typeId);
    }, [onTypeChange]),
  );

  const cpvType = useCpvType(product.productTypeID, product.productType);

  const onTypeSelectionStart = () => router.push('/category-selection');

  const labels = typeRowLabels(product.role);

  const header = (
    <DetailSectionHeader
      title={labels.title}
      tooltipTitle={
        editMode ? `Select a fitting category for the ${entityLabel(product)}.` : undefined
      }
    />
  );

  // View mode states the type in OverviewFacts; this is the edit control.
  if (!editMode) return null;

  // No type set: invite a pick.
  if (product.productTypeID === undefined) {
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

  return (
    <View>
      {header}
      {cpvType.status === 'error' ? (
        <CpvTypeLoadError typeID={product.productTypeID} retry={cpvType.retry} />
      ) : null}
      {cpvType.status === 'ready' ? (
        <CPVCard CPV={cpvType.type} onPress={onTypeSelectionStart} />
      ) : null}
    </View>
  );
}
