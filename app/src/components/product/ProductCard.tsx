import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { MutedText } from '@/components/base/MutedText';
import { MIN_TAP_TARGET } from '@/constants';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { getProfileHref } from '@/utils/router/profiles';

// undefined locale defers to the device's own locale instead of hard-coding en-US.
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const numberFormat = new Intl.NumberFormat();

function productSpecLine(product: Product): string {
  const facts: string[] = [];
  const weight = product.physicalProperties.weight;
  if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
    facts.push(`${numberFormat.format(weight)} g`);
  }
  if (product.components && product.components.length > 0) {
    const count = product.components.length;
    facts.push(`${numberFormat.format(count)} ${count === 1 ? 'component' : 'components'}`);
  }
  return facts.join(' • ');
}

function ProductCardSecondary({
  specLine,
  description,
}: {
  specLine: string;
  description?: string;
}) {
  return (
    <MutedText
      variant={specLine ? 'data' : 'caption'}
      selectable={false}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {specLine || description}
    </MutedText>
  );
}

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
  const specLine = productSpecLine(product);
  const createdAgo = relativeTime(product.createdAt);
  const ownerLabel = showOwner
    ? product.ownedBy === 'me'
      ? 'you'
      : (product.ownerUsername ?? 'anonymous')
    : null;

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
    // The card's press target deliberately does NOT wrap the owner link. It
    // used to, which nested the link inside the card button (axe
    // `nested-interactive`, undefined AT behaviour) and squeezed that link to
    // 21x18px. Thumbnail + text + timestamp are the press target; the owner
    // link is a sibling row below it, indented to line up with the text column.
    <Card className="mx-2.5 my-1.5">
      <View className="p-3">
        <Pressable
          onPress={enabled ? navigateToProduct : undefined}
          disabled={!enabled}
          accessibilityRole={enabled ? 'button' : undefined}
          style={pressableStyle}
          className="flex-row items-center"
        >
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
                borderRadius={8}
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
            <ProductCardSecondary specLine={specLine} description={product.description} />
            {createdAgo ? (
              // Inside the press target so the card has no inert strip: only
              // the owner link (a control of its own) sits outside it.
              <View className="mt-1 flex-row items-center gap-1">
                {/* `colors.outline` is the input-stroke token; as text it
                    measured 4.03:1. `onSurfaceVariant` is the muted-text
                    token and is 7.8:1 on the same card. */}
                <Icon name="clock" size={12} color={theme.colors.onSurfaceVariant} />
                <AppText variant="caption" style={{ color: theme.colors.onSurfaceVariant }}>
                  {createdAgo}
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>

        {ownerLabel ? (
          // pl-24 (96px) = thumbnail w-20 (80) + mr-4 (16), so this lines up
          // with the text column above it now that it is no longer nested in it.
          <View className="flex-row items-center pl-24" style={styles.metadataRow}>
            {/* The label always renders; only the LINK is conditional.
                `navigateToOwner` returns early without a username, so gating the
                whole block hid "you" on your own records, and gating nothing
                made an unnavigable label a full-size primary-coloured link that
                did nothing when pressed. */}
            {product.ownerUsername ? (
              <Pressable
                onPress={navigateToOwner}
                accessibilityRole="link"
                accessibilityLabel={`View ${ownerLabel}'s profile`}
                className="flex-row items-center gap-1 pr-2"
                style={styles.ownerLink}
              >
                <Icon name="user" size={12} color={theme.colors.onSurfaceVariant} />
                <AppText variant="caption" className="text-primary" numberOfLines={1}>
                  {ownerLabel}
                </AppText>
              </Pressable>
            ) : (
              <View className="flex-row items-center gap-1 pr-2">
                <Icon name="user" size={12} color={theme.colors.onSurfaceVariant} />
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {ownerLabel}
                </AppText>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const ProductCard = memo(ProductCardComponent);

export default ProductCard;

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  // The touch floor lives on the LINK, not the row. Putting `minHeight: 44` on
  // the row inflated an ~18px metadata line to 44px, which cost roughly 40% of
  // the records visible per screen on a list-first browse surface and left a
  // 44px strip below the press target that did nothing. The link reaches the
  // floor through vertical padding, and the negative margin lets that padding
  // overlap the row's own spacing instead of adding to it — a real 44px target
  // inside a row that stays the height of its text.
  metadataRow: {
    marginTop: 6,
  },
  ownerLink: {
    minHeight: MIN_TAP_TARGET,
    paddingVertical: 13,
    marginVertical: -13,
  },
  // expo-image's Image ignores className, so its sizing stays style-driven.
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});
