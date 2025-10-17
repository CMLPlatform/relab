import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { InfoTooltip, Text } from '@/components/base';
import CPVCard from '@/components/common/CPVCard';
import { CPVCategory } from '@/types/CPVCategory';
import { Product } from '@/types/Product';

import cpvJSON from '@/assets/data/cpv.json';

// HACK: This json includes a mapping to product types at the api.cml-relab.org backend and it WILL NOT WORK for local backends
// TODO: This mapping is from the api.cml-relab.org backend. We should fetch this from the backend instead of hardcoding it here.
const cpv = cpvJSON as Record<string, CPVCategory>;

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

  // Effects
  useEffect(() => {
    if (!typeSelection) return;
    router.setParams({ typeSelection: undefined });
    onTypeChange?.(parseInt(typeSelection));
  }, [onTypeChange, router, typeSelection]);

  // Callback
  const onTypeSelectionStart = () => {
    if (!editMode) return;
    const params = { id: product.id };
    router.push({ pathname: '/products/[id]/category_selection', params: params });
  };

  // Render
  return (
    <View style={{ padding: 14 }}>
      <Text
        style={{
          marginBottom: 12,
          fontSize: 24,
          fontWeight: 'bold',
        }}
      >
        Type or Material <InfoTooltip title="Select a fitting category for the product." />
      </Text>
      <CPVCard CPV={cpv[product.productTypeID || 'root']} onPress={editMode ? onTypeSelectionStart : undefined} />
    </View>
  );
}
