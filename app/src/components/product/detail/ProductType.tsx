import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import CPVCard from '@/components/product/CPVCard';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { entityLabel, type Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newType: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  // Hooks
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CPVCategory | null>(null);

  // When the category-selection screen pops back, apply the picked type. A
  // module slot (not a URL param) so this also works for an unsaved draft, which
  // has no [id] route to round-trip a param through.
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
        setSelectedType(cpv[String(product.productTypeID ?? 'root')] ?? cpv.root);
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

  // Render
  return (
    <View>
      {/* A sub-heading within the Overview section (not a duplicate of the
          Section title "Overview"), so it's demoted below Section-title weight. */}
      <DetailSectionHeader
        title="Type or Material"
        tooltipTitle={`Select a fitting category for the ${entityLabel(product)}.`}
        style={{ fontSize: 15, fontWeight: '600' }}
      />
      {selectedType ? (
        <CPVCard CPV={selectedType} onPress={editMode ? onTypeSelectionStart : undefined} />
      ) : null}
    </View>
  );
}
