import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import CPVCard from '@/components/common/CPVCard';
import productTypesMapping from '@/assets/data/product-types.json';

import { Product } from '@/types/Product';

type searchParams = {
  typeSelection?: string;
};

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newTypeId: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  const router = useRouter();
  const { typeSelection } = useLocalSearchParams<searchParams>();

  useEffect(() => {
    if (!typeSelection) return;
    router.setParams({ typeSelection: undefined });
    onTypeChange?.(parseInt(typeSelection));
  }, [typeSelection]);

  // Helper to get CPV code from product type ID
  // HACK: This mapping is based on the api.cml-relab.org backend and it WILL NOT WORK for local backends
  // TODO: This mapping is from the api.cml-relab.org backend. We should fetch this from the backend instead of hardcoding it here.
  const getCpvCodeFromProductTypeId = (productTypeId: number | undefined): string => {
    if (!productTypeId) return 'Unknown';
    const mapping = productTypesMapping.find((item) => item.id === productTypeId);
    return mapping?.name || 'Unknown';
  };

  const cpvCode = getCpvCodeFromProductTypeId(product.productType?.id);

  return (
    <View style={{ margin: 10, gap: 10 }}>
      <Text variant="titleLarge" style={{ marginBottom: 12, paddingLeft: 10 }}>
        Product Type / Material
      </Text>
      <CPVCard
        CPVId={cpvCode}
        onPress={() => {
          if (!editMode) return;
          const params = { id: product.id };
          router.push({ pathname: '/products/[id]/category_selection', params: params });
        }}
      />
    </View>
  );
}
