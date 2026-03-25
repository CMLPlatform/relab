import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { Chip } from '@/components/base';

import FilterSelectionModal from '@/components/common/FilterSelectionModal';
import { useSearchBrandsQuery } from '@/hooks/useProductQueries';
import { useDialog } from '@/components/common/DialogProvider';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onBrandChange?: (newBrand: string) => void;
  onModelChange?: (newModel: string) => void;
  isComponent?: boolean;
}

export default function ProductTags({ product, editMode, onBrandChange, onModelChange, isComponent = false }: Props) {
  const dialog = useDialog();

  const isBrandRequired = !isComponent;
  const isModelRequired = !isComponent;

  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(brandSearch);

  const onEditBrand = () => {
    if (!editMode) return;
    setBrandModalVisible(true);
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

      <FilterSelectionModal
        visible={brandModalVisible}
        onDismiss={() => setBrandModalVisible(false)}
        title="Select Brand"
        items={brandResults ?? []}
        isLoading={brandsLoading}
        selectedValues={product.brand ? [product.brand] : []}
        onSelectionChange={(vals) => {
          if (vals.length > 0) onBrandChange?.(vals[0]);
        }}
        searchQuery={brandSearch}
        onSearchChange={setBrandSearch}
        searchPlaceholder="Search or type a brand…"
        singleSelect
      />
    </View>
  );
}
