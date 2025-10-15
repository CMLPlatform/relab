import { View } from 'react-native';
import { Text } from '@/components/base';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
}

export default function ProductMetaData({ product }: Props) {
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
        Metadata <InfoTooltip title="Auto-generated metadata of the product" />
      </Text>

      <View style={{ gap: 8, paddingLeft: 4 }}>
        {product.createdAt && (
          <Text style={{ opacity: 0.7 }}>Created: {new Date(product.createdAt).toLocaleDateString()}</Text>
        )}
        {product.updatedAt && (
          <Text style={{ opacity: 0.7 }}>Last Updated: {new Date(product.updatedAt).toLocaleDateString()}</Text>
        )}
        <Text style={{ opacity: 0.7 }}>Product ID: {product.id}</Text>
      </View>
    </View>
  );
}
