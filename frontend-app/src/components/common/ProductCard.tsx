import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Card, Icon, useTheme } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import ImagePlaceholder from '@/components/common/ImagePlaceholder';
import type { Product } from '@/types/Product';

const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

function relativeTime(isoString?: string): string | null {
  if (!isoString) return null;
  const ms = new Date(isoString).getTime();
  if (Number.isNaN(ms)) return null;
  const diffDays = Math.round((ms - Date.now()) / 86_400_000);
  const diffMonths = Math.round(diffDays / 30);
  const diffYears = Math.round(diffDays / 365);
  if (Math.abs(diffYears) >= 1) return rtf.format(diffYears, 'year');
  if (Math.abs(diffMonths) >= 1) return rtf.format(diffMonths, 'month');
  return rtf.format(diffDays, 'day');
}

interface Props {
  product: Product;
  enabled?: boolean;
  showOwner?: boolean;
}

export default function ProductCard({ product, enabled = true, showOwner = false }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const [hadError, setHadError] = useState(false);

  const hasThumbnail = !hadError && !!product.thumbnailUrl;
  const detailList = [product.brand, product.model, product.productTypeName].filter(Boolean);
  const createdAgo = relativeTime(product.createdAt);
  const ownerLabel = showOwner
    ? product.ownedBy === 'me'
      ? 'you'
      : (product.ownerUsername ?? 'anonymous')
    : null;

  const navigateToProduct = () => {
    router.push({ pathname: '/products/[id]', params: { id: product.id } });
  };

  return (
    <Card
      elevation={2}
      onPress={enabled ? navigateToProduct : undefined}
      style={{ marginHorizontal: 10, marginVertical: 5 }}
    >
      <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ marginRight: 16 }}>
          {hasThumbnail ? (
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 12,
                backgroundColor: theme.colors.surfaceVariant,
                overflow: 'hidden',
              }}
            >
              <Image
                source={{ uri: product.thumbnailUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                onError={() => setHadError(true)}
                testID="product-thumbnail"
              />
            </View>
          ) : (
            <ImagePlaceholder width={80} height={80} borderRadius={12} testID="product-thumbnail" />
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: theme.colors.onSurface,
              marginBottom: 2,
            }}
          >
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
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {product.description}
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
                  <Text
                    style={{ fontSize: 11, color: theme.colors.primary }}
                    numberOfLines={1}
                    onPress={() => {
                      if (product.ownerUsername) {
                        router.push({
                          pathname: '/users/[username]',
                          params: { username: product.ownerUsername },
                        });
                      }
                    }}
                  >
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
