import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Icon } from 'react-native-paper';
import { MutedText } from '@/components/base/MutedText';
import { Text } from '@/components/base/Text';
import ImagePlaceholder from '@/components/common/ImagePlaceholder';
import { useAppTheme } from '@/theme';
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

function ProductCardComponent({ product, enabled = true, showOwner = false }: Props) {
  const router = useRouter();
  const theme = useAppTheme();
  const [hadError, setHadError] = useState(false);

  const hasThumbnail = !hadError && !!product.thumbnailUrl;
  const detailList = useMemo(
    () => [product.brand, product.model, product.productTypeName].filter(Boolean),
    [product.brand, product.model, product.productTypeName],
  );
  const createdAgo = relativeTime(product.createdAt);
  const ownerLabel = showOwner
    ? product.ownedBy === 'me'
      ? 'you'
      : (product.ownerUsername ?? 'anonymous')
    : null;
  const hasMetadata = createdAgo !== null || ownerLabel !== null;

  const navigateToProduct = useCallback(() => {
    if (typeof product.id !== 'number') return;
    router.push({
      pathname: product.role === 'component' ? '/components/[id]' : '/products/[id]',
      params: { id: product.id.toString() },
    });
  }, [product.id, product.role, router]);

  const navigateToOwner = useCallback(() => {
    if (!product.ownerUsername) return;
    router.push({
      pathname: '/users/[username]',
      params: { username: product.ownerUsername },
    });
  }, [product.ownerUsername, router]);

  return (
    <Card elevation={2} onPress={enabled ? navigateToProduct : undefined} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.thumbnailWrap}>
          {hasThumbnail ? (
            <View style={[styles.thumbnailFrame, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Image
                source={{ uri: product.thumbnailUrl }}
                style={styles.thumbnailImage}
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
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            {product.name || 'Unnamed Product'}
          </Text>
          <MutedText style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
            {detailList.join(' • ')}
          </MutedText>
          <MutedText style={styles.description} numberOfLines={1} ellipsizeMode="tail">
            {product.description}
          </MutedText>
          {hasMetadata && (
            <View style={styles.metadataRow}>
              {createdAgo && (
                <View style={styles.metadataItem}>
                  <Icon source="clock-outline" size={12} color={theme.colors.outline} />
                  <Text style={[styles.metadataText, { color: theme.colors.outline }]}>
                    {createdAgo}
                  </Text>
                </View>
              )}
              {ownerLabel && (
                <View style={styles.metadataItem}>
                  <Icon source="account-outline" size={12} color={theme.colors.outline} />
                  <Text
                    style={[styles.metadataText, { color: theme.colors.primary }]}
                    numberOfLines={1}
                    onPress={navigateToOwner}
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

const ProductCard = memo(ProductCardComponent);

export default ProductCard;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 10,
    marginVertical: 5,
  },
  row: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnailWrap: {
    marginRight: 16,
  },
  thumbnailFrame: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 13,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metadataText: {
    fontSize: 11,
  },
});
