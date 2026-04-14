import { Link } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/base/Text';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
}

export default function ProductMetaData({ product }: Props) {
  // Render
  return (
    <View>
      <DetailSectionHeader title="Metadata" tooltipTitle="Auto-generated metadata of the product" />

      <View style={{ gap: 8, marginBottom: 8 }}>
        {product.createdAt && (
          <Text style={{ opacity: 0.7 }}>
            Created: {new Date(product.createdAt).toLocaleDateString()}
          </Text>
        )}
        {product.updatedAt && (
          <Text style={{ opacity: 0.7 }}>
            Last Updated: {new Date(product.updatedAt).toLocaleDateString()}
          </Text>
        )}
        <Text style={{ opacity: 0.7 }}>
          Owner:{' '}
          {product.ownerUsername ? (
            <Link
              href={`/users/${product.ownerUsername}`}
              style={{ color: '#1565C0', textDecorationLine: 'underline' }}
            >
              {product.ownerUsername}
            </Link>
          ) : (
            'Anonymous'
          )}
        </Text>
        <Text style={{ opacity: 0.7 }}>Product ID: {product.id}</Text>
      </View>
    </View>
  );
}
