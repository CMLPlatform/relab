import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from 'react-native-paper';

import { useRouter } from 'expo-router';
import { Text } from '@/components/base';
import { useDialog } from '@/components/common/DialogProvider';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import ProductCard from '@/components/common/ProductCard';
import { productComponents } from '@/services/api/fetching';
import { getProductNameHelperText, validateProductName } from '@/services/api/validation/product';
import { setNewProductIntent } from '@/services/newProductStore';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
}

export default function ProductComponents({ product, editMode }: Props) {
  // Hooks
  const router = useRouter();
  const dialog = useDialog();

  // States
  const [components, setComponents] = useState<Product[]>([]);

  // Effects
  useEffect(() => {
    productComponents(product).then(setComponents);
  }, [product]);

  // Callbacks
  const newComponent = () => {
    dialog.input({
      title: 'Create New Component',
      placeholder: 'Component Name',
      helperText: getProductNameHelperText(),
      buttons: [
        { text: 'Cancel' },
        {
          text: 'OK',
          disabled: (value) => {
            const result = validateProductName(value);
            return !result.isValid;
          },
          onPress: (componentName) => {
            const name = typeof componentName === 'string' ? componentName.trim() : '';
            const result = validateProductName(name);

            if (!result.isValid) {
              // This shouldn't happen due to disabled check, but handle defensively
              alert(result.error);
              return;
            }

            setNewProductIntent({
              name,
              isComponent: true,
              parentID: typeof product.id === 'number' ? product.id : undefined,
            });
            router.push({ pathname: '/products/[id]', params: { id: 'new' } });
          },
        },
      ],
    });
  };

  // Render
  return (
    <View>
      <DetailSectionHeader
        title={`Components (${product.componentIDs.length})`}
        tooltipTitle="Add components after saving the product."
      />
      {components.length === 0 && (
        <Text style={{ opacity: 0.7, marginBottom: 8 }}>This product has no subcomponents.</Text>
      )}
      {components.map((component, index) => (
        <ProductCard key={component.id} product={component} enabled={!editMode} />
      ))}
      {editMode || product.ownedBy !== 'me' || (
        <Button
          compact={true}
          icon="plus"
          mode="contained"
          onPress={newComponent}
          style={{ marginHorizontal: 16, marginVertical: 8 }}
        >
          Add component
        </Button>
      )}
    </View>
  );
}
