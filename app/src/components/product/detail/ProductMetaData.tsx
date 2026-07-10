import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import { Text } from '@/components/base/Text';
import { useAppTheme } from '@/theme';
import { entityLabel, entityLabelTitle, type Product } from '@/types/Product';
import { getProfileHref } from '@/utils/router/profiles';

interface Props {
  product: Product;
}

export default function ProductMetaData({ product }: Props) {
  const theme = useAppTheme();
  return (
    <View>
      <DetailSectionHeader
        title="Metadata"
        tooltipTitle={`Auto-generated metadata of the ${entityLabel(product)}`}
      />

      <View style={styles.list}>
        {product.createdAt ? (
          <Text style={styles.meta}>
            Created: {new Date(product.createdAt).toLocaleDateString()}
          </Text>
        ) : null}
        {product.updatedAt ? (
          <Text style={styles.meta}>
            Last Updated: {new Date(product.updatedAt).toLocaleDateString()}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          Owner:{' '}
          {product.ownerUsername ? (
            <Link
              href={getProfileHref(product.ownerUsername)}
              style={[styles.link, { color: theme.tokens.text.link }]}
            >
              {product.ownerUsername}
            </Link>
          ) : (
            'Anonymous'
          )}
        </Text>
        <Text style={styles.meta}>
          {entityLabelTitle(product)} ID: {product.id}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginBottom: 8 },
  meta: { opacity: 0.7 },
  link: { textDecorationLine: 'underline' },
});
