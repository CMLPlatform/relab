import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { MutedText } from '@/components/base/MutedText';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { getProfileHref } from '@/utils/router/profiles';

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
    router.push(getProfileHref(product.ownerUsername));
  }, [product.ownerUsername, router]);

  const handleImageError = useCallback(() => setHadError(true), []);
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => (pressed && enabled ? styles.pressed : undefined),
    [enabled],
  );

  return (
    <Pressable
      onPress={enabled ? navigateToProduct : undefined}
      disabled={!enabled}
      accessibilityRole={enabled ? 'button' : undefined}
      style={pressableStyle}
    >
      <Card className="mx-2.5 my-[5px]">
        <View className="flex-row items-center p-3">
          <View className="mr-4">
            {hasThumbnail ? (
              <View
                className="w-20 h-20 rounded-lg overflow-hidden"
                style={{ backgroundColor: theme.colors.surfaceVariant }}
              >
                <Image
                  source={{ uri: product.thumbnailUrl }}
                  style={styles.thumbnailImage}
                  contentFit="cover"
                  onError={handleImageError}
                  testID="product-thumbnail"
                  // Decorative: the product name is shown as adjacent text, so
                  // an empty alt keeps the <img> valid for axe without making
                  // screen readers announce the name twice per card.
                  accessibilityLabel=""
                />
              </View>
            ) : (
              <ImagePlaceholder
                width={80}
                height={80}
                borderRadius={12}
                testID="product-thumbnail"
              />
            )}
          </View>

          {/* Content */}
          <View className="flex-1">
            <AppText variant="heading" className="mb-0.5 font-bold">
              {product.name || 'Unnamed Product'}
            </AppText>
            <MutedText
              variant="caption"
              className="mb-1"
              selectable={false}
              numberOfLines={1}
              ellipsizeMode="tail"
              accessibilityLabel={detailList.join(', ')}
            >
              {detailList.join(' • ')}
            </MutedText>
            <MutedText variant="caption" selectable={false} numberOfLines={1} ellipsizeMode="tail">
              {product.description}
            </MutedText>
            {hasMetadata ? (
              <View className="flex-row items-center gap-2.5 mt-1.5">
                {createdAgo ? (
                  <View className="flex-row items-center gap-[3px]">
                    <Icon name="clock" size={12} color={theme.colors.outline} />
                    <AppText variant="caption" style={{ color: theme.colors.outline }}>
                      {createdAgo}
                    </AppText>
                  </View>
                ) : null}
                {ownerLabel ? (
                  <View className="flex-row items-center gap-[3px]">
                    <Icon name="user" size={12} color={theme.colors.outline} />
                    <AppText
                      variant="caption"
                      className="text-primary"
                      numberOfLines={1}
                      onPress={navigateToOwner}
                    >
                      {ownerLabel}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const ProductCard = memo(ProductCardComponent);

export default ProductCard;

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  // expo-image's Image ignores className, so its sizing stays style-driven.
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});
