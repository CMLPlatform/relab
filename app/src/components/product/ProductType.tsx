import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import CPVCard from '@/components/common/CPVCard';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { entityLabel, type Product } from '@/types/Product';

type searchParams = {
  typeSelection?: string;
};

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newType: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  // Hooks
  const router = useRouter();
  const { typeSelection } = useLocalSearchParams<searchParams>();
  const [selectedType, setSelectedType] = useState<CPVCategory | null>(null);

  // Effects
  useEffect(() => {
    if (!typeSelection) return;
    router.setParams({ typeSelection: undefined });
    onTypeChange?.(parseInt(typeSelection, 10));
  }, [onTypeChange, router, typeSelection]);

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
    if (typeof product.id !== 'number') return;
    router.push({
      pathname: '/products/[id]/category-selection',
      params: { id: product.id.toString() },
    });
  };

  // Render
  return (
    <View>
      <DetailSectionHeader
        title="Type or Material"
        tooltipTitle={`Select a fitting category for the ${entityLabel(product)}.`}
      />
      {selectedType ? (
        <CPVCard CPV={selectedType} onPress={editMode ? onTypeSelectionStart : undefined} />
      ) : null}
    </View>
  );
}
