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
    <View className="gap-2 mb-2">
      {product.createdAt ? (
        <AppText variant="plain" className="opacity-70">
          Created: {new Date(product.createdAt).toLocaleDateString()}
        </AppText>
      ) : null}
      {product.updatedAt ? (
        <AppText variant="plain" className="opacity-70">
          Last Updated: {new Date(product.updatedAt).toLocaleDateString()}
        </AppText>
      ) : null}
      <AppText variant="plain" className="opacity-70">
        Owner:{' '}
        {product.ownerUsername ? (
          // expo-router's Link isn't the react-native-css-rewritten core Text,
          // so className is a silent no-op here — stays style-driven.
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
      <AppText variant="plain" className="opacity-70">
        {entityLabelTitle(product)} ID: {product.id}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
