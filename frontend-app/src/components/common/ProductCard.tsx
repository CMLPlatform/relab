import { Pressable, View } from 'react-native';
import React from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { Image } from 'expo-image';
import { Product } from '@/types/Product';
import { Text } from '@/components/base';

interface Props {
  product: Product;
  enabled?: boolean;
}

export default function ProductCard({ product, enabled = true }: Props) {
  // Hooks
  const router = useRouter();
  const theme = useTheme();

  // Variables
  const detailList = [
    product.brand,
    product.model,
    product.componentIDs.length === 1 && `1 component`,
    product.componentIDs.length > 1 && `${product.componentIDs.length} components`,
  ].filter(Boolean);

  const thumbnailUrl = product.images?.[0]?.thumbnail_url;

  // Callbacks
  const navigateToProduct = () => {
    const params = { id: product.id };
    router.push({ pathname: '/products/[id]', params: params });
  };

  // Render
  return (
    <Pressable
      onPress={enabled ? navigateToProduct : undefined}
      style={({ pressed }) => [
        {
          padding: 10,
          paddingLeft: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        pressed && enabled && { backgroundColor: theme.colors.secondaryContainer },
      ]}
    >
      {/* Thumbnail Image */}
      {thumbnailUrl && (
        <Image
          source={{ uri: thumbnailUrl }}
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
          }}
          contentFit="cover"
        />
      )}

      {/* Product Details */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>{product.name || 'Unnamed Product'}</Text>
        <Text style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={1} ellipsizeMode="tail">
          {detailList.join(' • ')}
        </Text>
        <Text style={{ fontSize: 16, marginBottom: 4 }} numberOfLines={1} ellipsizeMode="tail">
          {product.description || 'No description provided.'}
        </Text>
      </View>
    </Pressable>
  );
}
