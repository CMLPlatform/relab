import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Chip } from '@/components/base';

import { useDialog } from '@/components/common/DialogProvider';
import { Product } from '@/types/Product';

type searchParams = {
  brandSelection?: string;
};

interface Props {
  product: Product;
  editMode: boolean;
  onBrandChange?: (newBrand: string) => void;
  onModelChange?: (newModel: string) => void;
  isComponent?: boolean;
}

export default function ProductTags({ product, editMode, onBrandChange, onModelChange, isComponent = false }: Props) {
  // Hooks
  const router = useRouter();
  const dialog = useDialog();
  const { brandSelection } = useLocalSearchParams<searchParams>();

  const isBrandRequired = !isComponent;
  const isModelRequired = !isComponent;

  // Effects
  useEffect(() => {
    if (!brandSelection) return;
    router.setParams({ brandSelection: undefined });
    onBrandChange?.(brandSelection!);
  }, [brandSelection]);

  // Callbacks
  const onEditBrand = () => {
    if (!editMode) return;
    const params = { id: product.id, brand: product.brand };
    router.push({ pathname: '/products/[id]/brand_selection', params: params });
  };

  const onEditModel = () => {
    if (!editMode) return;
    dialog.input({
      title: 'Set Model',
      placeholder: 'Model Name',
      defaultValue: product.model || '',
      buttons: [
        { text: 'Cancel', onPress: () => undefined },
        {
          text: 'OK',
          onPress: (modelName) => {
            onModelChange?.(modelName || '');
          },
        },
      ],
    });
  };

  // Render
  return (
    <View style={{ marginVertical: 12, paddingHorizontal: 16, gap: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
      <Chip
        title={'Brand'}
        onPress={onEditBrand}
        icon={editMode && <MaterialCommunityIcons name={'pencil'} />}
        error={isBrandRequired && !product.brand}
      >
        {product.brand || 'Unknown'}
      </Chip>
      <Chip
        title={'Model'}
        onPress={onEditModel}
        icon={editMode && <MaterialCommunityIcons name={'pencil'} />}
        error={isModelRequired && !product.model}
      >
        {product.model || 'Unknown'}
      </Chip>
    </View>
  );
}
