import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import CPVCard from '@/components/product/CPVCard';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { entityLabel, type Product, typeRowLabels } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newType: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  // Hooks
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CPVCategory | null>(null);

  // Apply the type picked on the category-selection screen (see pendingTypeSelection.ts).
  useFocusEffect(
    useCallback(() => {
      const typeId = takePendingTypeSelection();
      if (typeId !== null) onTypeChange?.(typeId);
    }, [onTypeChange]),
  );

  useEffect(() => {
    let isMounted = true;

    loadCPV()
      .then((cpv) => {
        if (!isMounted) return;
        // Never fall back to cpv.root: its {name: "undefined"} placeholder
        // renders as a red "Category undefined" card.
        setSelectedType(cpv[String(product.productTypeID ?? 'root')] ?? null);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [product.productTypeID]);

  // Callback
  const onTypeSelectionStart = () => {
    if (!editMode) return;
    router.push('/category-selection');
  };

  const labels = typeRowLabels(product.role);

  const header = (
    <DetailSectionHeader
      title={labels.title}
      tooltipTitle={`Select a fitting category for the ${entityLabel(product)}.`}
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
      {selectedType ? (
        <CPVCard CPV={selectedType} onPress={editMode ? onTypeSelectionStart : undefined} />
      ) : null}
    </View>
  );
}
