import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
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

  // A sub-heading within the Overview section (not a duplicate of the
  // Section title "Overview"), so it's demoted below Section-title weight.
  const header = (
    <DetailSectionHeader
      title="Type or Material"
      tooltipTitle={`Select a fitting category for the ${entityLabel(product)}.`}
      style={{ fontSize: 15, fontWeight: '600' }}
    />
  );

  // No type set: the CPV "root" entry is a placeholder ({name: "undefined"})
  // that CPVCard renders as a red error card — showing that as the default
  // first impression of a freshly captured record reads as a bug, not an
  // empty state. In edit mode, invite the user to pick a type instead; in
  // view mode, render nothing (the Section's own isEmpty check already hides
  // the whole section when there's no other content to show).
  if (product.productTypeID === undefined) {
    if (!editMode) return null;
    return (
      <View>
        {header}
        <AppButton
          variant="outline"
          className="w-full"
          accessibilityLabel="Choose a type or material"
          onPress={onTypeSelectionStart}
        >
          Choose a type or material
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
