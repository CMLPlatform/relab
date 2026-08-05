import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { useAppTheme } from '@/theme';
import { entityLabelTitle, type Product } from '@/types/Product';
import { getProfileHref } from '@/utils/router/profiles';

interface Props {
  product: Product;
}

export default function ProductMetaData({ product }: Props) {
  const theme = useAppTheme();
  return (
    <View style={styles.list}>
      {product.createdAt ? (
        <AppText variant="plain" style={styles.meta}>
          Created: {new Date(product.createdAt).toLocaleDateString()}
        </AppText>
      ) : null}
      {product.updatedAt ? (
        <AppText variant="plain" style={styles.meta}>
          Last Updated: {new Date(product.updatedAt).toLocaleDateString()}
        </AppText>
      ) : null}
      <AppText variant="plain" style={styles.meta}>
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
      </AppText>
      <AppText variant="plain" style={styles.meta}>
        {entityLabelTitle(product)} ID: {product.id}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginBottom: 8 },
  meta: { opacity: 0.7 },
  link: { textDecorationLine: 'underline' },
});
