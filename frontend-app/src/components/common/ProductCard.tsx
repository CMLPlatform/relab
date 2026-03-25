import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Card, Icon, useTheme } from 'react-native-paper';
import { Product } from '@/types/Product';
import { Text } from '@/components/base';

const rtf =
  Platform.OS === 'web' || Platform.OS === 'ios' ? new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }) : null;

function formatFallback(value: number, unit: 'year' | 'month' | 'day'): string {
  if (value === 0 && unit === 'day') return 'today';
  if (value === -1 && unit === 'day') return 'yesterday';
  if (value === 1 && unit === 'day') return 'tomorrow';

  const abs = Math.abs(value);
  const plural = abs === 1 ? '' : 's';
  return value < 0 ? `${abs} ${unit}${plural} ago` : `in ${abs} ${unit}${plural}`;
}

function relativeTime(isoString?: string): string | null {
  if (!isoString) return null;
  const ms = new Date(isoString).getTime();
  if (isNaN(ms)) return null;
  const diffDays = Math.round((ms - Date.now()) / 86_400_000);
  const diffMonths = Math.round(diffDays / 30);
  const diffYears = Math.round(diffDays / 365);
  if (Math.abs(diffYears) >= 1) {
    return rtf ? rtf.format(diffYears, 'year') : formatFallback(diffYears, 'year');
  }
  if (Math.abs(diffMonths) >= 1) {
    return rtf ? rtf.format(diffMonths, 'month') : formatFallback(diffMonths, 'month');
  }
  return rtf ? rtf.format(diffDays, 'day') : formatFallback(diffDays, 'day');
}

interface Props {
  product: Product;
  enabled?: boolean;
  showOwner?: boolean;
}

export default function ProductCard({ product, enabled = true, showOwner = false }: Props) {
  // Hooks
  const router = useRouter();
  const theme = useTheme();
  const placeholderImageUrl = `https://placehold.co/80x80/png?text=${product.name.replaceAll(' ', '+')}`;
  const [thumbnailUri, setThumbnailUri] = useState(product.thumbnailUrl ?? placeholderImageUrl);

  // Variables
  const detailList = [product.brand, product.model, product.productTypeName].filter(Boolean);
  const createdAgo = relativeTime(product.createdAt);
  const ownerLabel = showOwner ? (product.ownedBy === 'me' ? 'you' : (product.ownerUsername ?? null)) : null;

  useEffect(() => {
    setThumbnailUri(product.thumbnailUrl ?? placeholderImageUrl);
  }, [product.thumbnailUrl, placeholderImageUrl]);

  // Callbacks
  const navigateToProduct = () => {
    const params = { id: product.id };
    router.push({ pathname: '/products/[id]', params: params });
  };

  // Render
  return (
    <Card
      elevation={2}
      onPress={enabled ? navigateToProduct : undefined}
      style={{ marginHorizontal: 10, marginVertical: 5 }}
    >
      <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
        {/* Thumbnail */}
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceVariant,
            overflow: 'hidden',
            marginRight: 16,
          }}
        >
          {thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              onError={() => {
                if (thumbnailUri !== placeholderImageUrl) setThumbnailUri(placeholderImageUrl);
              }}
              testID="product-thumbnail"
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, color: theme.colors.onSurfaceVariant }}>📦</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 2 }}>
            {product.name || 'Unnamed Product'}
          </Text>
          <Text
            style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {detailList.join(' • ')}
          </Text>
          <Text
            style={{ fontSize: 14, color: theme.colors.onSurfaceVariant, lineHeight: 20 }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {product.description || 'No description provided.'}
          </Text>
          {(createdAgo || ownerLabel) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
              {createdAgo && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon source="clock-outline" size={12} color={theme.colors.outline} />
                  <Text style={{ fontSize: 11, color: theme.colors.outline }}>{createdAgo}</Text>
                </View>
              )}
              {ownerLabel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon source="account-outline" size={12} color={theme.colors.outline} />
                  <Text style={{ fontSize: 11, color: theme.colors.outline }} numberOfLines={1}>
                    {ownerLabel}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Card>
  );
}
