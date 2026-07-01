import { Link } from 'expo-router';
import { View } from 'react-native';
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

      <View style={{ gap: 8, marginBottom: 8 }}>
        {product.createdAt && (
          <Text style={{ opacity: 0.7 }}>
            Created: {new Date(product.createdAt).toLocaleDateString()}
          </Text>
        )}
        {product.updatedAt && (
          <Text style={{ opacity: 0.7 }}>
            Last Updated: {new Date(product.updatedAt).toLocaleDateString()}
          </Text>
        )}
        <Text style={{ opacity: 0.7 }}>
          Owner:{' '}
          {product.ownerUsername ? (
            <Link
              href={getProfileHref(product.ownerUsername)}
              style={{ color: theme.tokens.text.link, textDecorationLine: 'underline' }}
            >
              {product.ownerUsername}
            </Link>
          ) : (
            'Anonymous'
          )}
        </Text>
        <Text style={{ opacity: 0.7 }}>
          {entityLabelTitle(product)} ID: {product.id}
        </Text>
      </View>
    </View>
  );
}
