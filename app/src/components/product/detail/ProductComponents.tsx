import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { Text } from '@/components/base/Text';
import { entityLabel, type Product } from '@/types/Product';
import { ComponentRow } from './ComponentRow';

interface Props {
  product: Product;
  editMode: boolean;
}

export default function ProductComponents({ product, editMode }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const components = product.components ?? [];
  const label = entityLabel(product);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

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
      {components.length === 0 && (
        <Text style={{ opacity: 0.7, marginBottom: 8 }}>This {label} has no subcomponents.</Text>
      )}
      {visibleComponents.map((component) => (
        <ComponentRow key={component.id} component={component} enabled={!editMode} />
      ))}
      {components.length > 5 && (
        <AppButton variant="ghost" onPress={toggleExpanded}>
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </AppButton>
      )}
      {editMode || product.ownedBy !== 'me' || (
        <AppButton variant="primary" onPress={newComponent} className="mx-4 my-2">
          Add component
        </AppButton>
      )}
    </View>
  );
}
