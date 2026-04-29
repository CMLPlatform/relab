import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import ProductCard from '@/components/common/ProductCard';
import { entityLabel, type Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
}

export default function ProductComponents({ product, editMode }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const components = product.components ?? [];
  const label = entityLabel(product);

  const newComponent = () => {
    if (typeof product.id !== 'number') return;
    router.push({
      pathname:
        product.role === 'component'
          ? '/components/[id]/components/new'
          : '/products/[id]/components/new',
      params: { id: product.id.toString() },
    });
  };

  const visibleComponents = expanded ? components : components.slice(0, 5);
  const hiddenCount = Math.max(0, components.length - visibleComponents.length);

  return (
    <View>
      <DetailSectionHeader
        title={`Components (${components.length})`}
        tooltipTitle={`Add components after saving the ${label}.`}
      />
      {components.length === 0 && (
        <Text style={{ opacity: 0.7, marginBottom: 8 }}>This {label} has no subcomponents.</Text>
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
