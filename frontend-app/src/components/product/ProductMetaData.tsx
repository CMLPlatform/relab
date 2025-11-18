import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { InfoTooltip, Text } from '@/components/base';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
}

export default function ProductMetaData({ product }: Props) {
  const router = useRouter();

  const handleOwnerPress = () => {
    if (product.ownedBy !== 'me' && typeof product.ownedBy === 'string') {
      router.push(`/users/${product.ownedBy}`);
    }
  };

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
        {product.ownedBy && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ opacity: 0.7 }}>Owner: </Text>
            {product.ownedBy === 'me' ? (
              <Text style={{ opacity: 0.7 }}>You</Text>
            ) : (
              <Pressable onPress={handleOwnerPress}>
                <Text style={{ color: '#2196F3', textDecorationLine: 'underline' }}>View Profile</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
