import { View } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
}

export default function ProductMetaData({ product }: Props) {
  // Render
  return (
    <Card style={{ margin: 10 }}>
      <Card.Content>
        <Text variant="titleLarge" style={{ marginBottom: 12 }}>
          Metadata
        </Text>
        <View style={{ gap: 8 }}>
          {product.createdAt && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                Created:
              </Text>
              <Text variant="bodyMedium">{new Date(product.createdAt).toLocaleDateString()}</Text>
            </View>
          )}
          {product.updatedAt && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                Last Updated:
              </Text>
              <Text variant="bodyMedium">{new Date(product.updatedAt).toLocaleDateString()}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
              Product ID:
            </Text>
            <Text variant="bodyMedium">{product.id}</Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}
