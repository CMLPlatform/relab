import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { useDialog } from '@/components/common/dialogContext';
import ProductCard from '@/components/common/ProductCard';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { productComponents } from '@/services/api/products';
import { getProductNameHelperText, productSchema } from '@/services/api/validation/productSchema';
import { setNewProductIntent } from '@/services/newProductStore';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
}

export default function ProductComponents({ product, editMode }: Props) {
  // Hooks
  const router = useRouter();
  const dialog = useDialog();
  const feedback = useAppFeedback();

  // States
  const [components, setComponents] = useState<Product[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Effects
  useEffect(() => {
    async function loadComponents() {
      try {
        const nextComponents = await productComponents(product);
        setComponents(nextComponents);
      } catch {
        // Keep the section empty when the subcomponent query fails.
      }
    }

    loadComponents().catch(() => {});
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
            const parseResult = productSchema.shape.name.safeParse(value);
            return !parseResult.success;
          },
          onPress: (componentName) => {
            const name = typeof componentName === 'string' ? componentName.trim() : '';
            const parseResult = productSchema.shape.name.safeParse(name);

            if (!parseResult.success) {
              feedback.error(
                parseResult.error.issues[0]?.message || 'Invalid component name',
                'Invalid component name',
              );
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

  const visibleComponents = expanded ? components : components.slice(0, 5);
  const hiddenCount = Math.max(0, components.length - visibleComponents.length);

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
      {visibleComponents.map((component) => (
        <ProductCard key={component.id} product={component} enabled={!editMode} />
      ))}
      {components.length > 5 && (
        <Button compact={true} mode="text" onPress={() => setExpanded((current) => !current)}>
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </Button>
      )}
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
