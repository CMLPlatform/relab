import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, type PressableStateCallbackType, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import { Icon } from '@/components/base/Icon';
import CPVCard from '@/components/product/CPVCard';
import { MIN_TAP_TARGET } from '@/constants';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { loadCPV } from '@/services/cpv';
import { useAppTheme } from '@/theme/appThemeContext';
import type { CPVCategory } from '@/types/CPVCategory';
import { entityLabel, type Product, typeRowLabels } from '@/types/Product';

const linkStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.link,
  pressed && { opacity: 0.5 },
];

function ViewProductsOfTypeLink({ typeName, onPress }: { typeName: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      style={linkStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View all products of type ${typeName}`}
    >
      <AppText variant="caption" className="text-right" style={{ color: colors.primary }}>
        View all
      </AppText>
      <Icon size="md" name="chevron-right" color={colors.primary} />
    </Pressable>
  );
}

interface Props {
  product: Product;
  editMode: boolean;
  onTypeChange?: (newType: number) => void;
}

export default function ProductType({ product, editMode, onTypeChange }: Props) {
  // Hooks
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CPVCategory | null>(null);

  // Apply the type picked on the category-selection screen (see pendingTypeSelection.ts).
  useFocusEffect(
    useCallback(() => {
      const typeId = takePendingTypeSelection();
      if (typeId !== null) onTypeChange?.(typeId);
    }, [onTypeChange]),
  );

  useEffect(() => {
    let isMounted = true;

    loadCPV()
      .then((cpv) => {
        if (!isMounted) return;
        // Never fall back to cpv.root: its {name: "undefined"} placeholder
        // renders as a red "Category undefined" card.
        setSelectedType(cpv[String(product.productTypeID ?? 'root')] ?? null);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [product.productTypeID]);

  // Callback
  const onTypeSelectionStart = () => {
    if (!editMode) return;
    router.push('/category-selection');
  };

  // Filters the products list by this type's name — the same value the list
  // reads back via screenData.ts's `types` param.
  const onViewAllOfType = () => {
    if (!product.productTypeName) return;
    router.push({ pathname: '/products', params: { types: product.productTypeName } });
  };

  // The snapshot is keyed by its own ids, which match the database's only by
  // construction order, so a recorded type is shown as the API returned it.
  // A type picked since load has only a snapshot id, so it falls through.
  const recordedType =
    product.productType?.id === product.productTypeID ? product.productType : undefined;
  const shownType = recordedType
    ? { name: recordedType.name, description: recordedType.description ?? '' }
    : selectedType;

  const labels = typeRowLabels(product.role);

  const header = (
    <DetailSectionHeader
      title={labels.title}
      tooltipTitle={
        editMode ? `Select a fitting category for the ${entityLabel(product)}.` : undefined
      }
    />
  );

  // No type set: invite in edit mode, render nothing in view mode.
  if (product.productTypeID === undefined) {
    if (!editMode) return null;
    return (
      <View>
        {header}
        <AppButton
          variant="outline"
          className="w-full"
          accessibilityLabel={labels.choose}
          onPress={onTypeSelectionStart}
        >
          {labels.choose}
        </AppButton>
      </View>
    );
  }

  // Render
  return (
    <View>
      {header}
      {shownType ? (
        <CPVCard
          CPV={shownType}
          onPress={editMode ? onTypeSelectionStart : undefined}
          actionElement={
            !editMode && product.productTypeName ? (
              <ViewProductsOfTypeLink
                typeName={product.productTypeName}
                onPress={onViewAllOfType}
              />
            ) : undefined
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
});
