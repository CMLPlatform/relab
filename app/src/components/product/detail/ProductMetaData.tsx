import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { MIN_TAP_TARGET, WEB_FOCUS_RING } from '@/constants';
import { entityLabelTitle, type Product } from '@/types/Product';
import { getProfileHref } from '@/utils/router/profiles';

interface Props {
  product: Product;
}

/** Footer row: caption label, data value (DESIGN.md ramp). */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      <AppText variant="caption" className="text-muted-foreground">
        {label}:
      </AppText>
      {children}
    </View>
  );
}

export default function ProductMetaData({ product }: Props) {
  const router = useRouter();
  const { ownerUsername } = product;
  const openOwner = useCallback(() => {
    if (ownerUsername) router.push(getProfileHref(ownerUsername));
  }, [ownerUsername, router]);
  return (
    <View className="gap-1 mb-2">
      {product.createdAt ? (
        <MetaRow label="Created">
          <AppText variant="data">{new Date(product.createdAt).toLocaleDateString()}</AppText>
        </MetaRow>
      ) : null}
      {product.updatedAt ? (
        <MetaRow label="Last Updated">
          <AppText variant="data">{new Date(product.updatedAt).toLocaleDateString()}</AppText>
        </MetaRow>
      ) : null}
      <MetaRow label="Owner">
        {product.ownerUsername ? (
          // 44px floor via padding that a negative margin lets overlap the row,
          // same as ProductCard's owner link: the text stays caption-sized.
          <Pressable
            onPress={openOwner}
            accessibilityRole="link"
            accessibilityLabel={`View ${product.ownerUsername}'s profile`}
            className={`justify-center ${WEB_FOCUS_RING}`}
            style={styles.ownerLink}
          >
            <AppText variant="data" className="text-primary underline">
              {product.ownerUsername}
            </AppText>
          </Pressable>
        ) : (
          <AppText variant="data">Anonymous</AppText>
        )}
      </MetaRow>
      <MetaRow label={`${entityLabelTitle(product)} ID`}>
        <AppText variant="data">{product.id}</AppText>
      </MetaRow>
    </View>
  );
}

const styles = StyleSheet.create({
  ownerLink: {
    minHeight: MIN_TAP_TARGET,
    paddingVertical: 12,
    marginVertical: -12,
  },
});
