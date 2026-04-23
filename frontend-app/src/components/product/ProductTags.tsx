import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type JSX, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/base/Chip';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { Text } from '@/components/base/Text';
import { useDialog } from '@/components/common/dialogContext';
import FilterSelectionModal from '@/components/common/FilterSelectionModal';
import { useSearchBrandsQuery } from '@/hooks/useProductQueries';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onBrandChange?: (newBrand: string) => void;
  onModelChange?: (newModel: string) => void;
  onAmountChange?: (newAmount: number) => void;
  isComponent?: boolean;
}

export default function ProductTags({
  product,
  editMode,
  onBrandChange,
  onModelChange,
  onAmountChange,
  isComponent = false,
}: Props) {
  const dialog = useDialog();

  const isBrandRequired = !isComponent;
  const isModelRequired = !isComponent;

  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(brandSearch);

  const onEditBrand = () => {
    if (!editMode) return;
    setBrandModalVisible(true);
  };

  const onEditModel = () => {
    if (!editMode) return;
    dialog.input({
      title: 'Set Model',
      placeholder: 'Model Name',
      defaultValue: product.model ?? '',
      buttons: [
        { text: 'Cancel', onPress: () => undefined },
        {
          text: 'OK',
          onPress: (modelName) => {
            onModelChange?.(modelName ?? '');
          },
        },
      ],
    });
  };

  return (
    <View
      style={{
        marginVertical: 12,
        paddingHorizontal: 16,
        gap: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}
    >
      <Chip
        title={'Brand'}
        onPress={onEditBrand}
        icon={editMode && <MaterialCommunityIcons name={'pencil'} />}
        error={isBrandRequired && !product.brand}
      >
        {product.brand ?? 'Unknown'}
      </Chip>
      <Chip
        title={'Model'}
        onPress={onEditModel}
        icon={editMode && <MaterialCommunityIcons name={'pencil'} />}
        error={isModelRequired && !product.model}
      >
        {product.model ?? 'Unknown'}
      </Chip>
      {isComponent && (
        <AmountChip product={product} editMode={editMode} onAmountChange={onAmountChange} />
      )}

      <FilterSelectionModal
        visible={brandModalVisible}
        onDismiss={() => setBrandModalVisible(false)}
        title="Select Brand"
        items={brandResults ?? []}
        isLoading={brandsLoading}
        selectedValues={product.brand ? [product.brand] : []}
        onSelectionChange={(vals) => {
          onBrandChange?.(vals.length > 0 ? vals[0] : '');
        }}
        searchQuery={brandSearch}
        onSearchChange={setBrandSearch}
        searchPlaceholder="Search or type a brand…"
        singleSelect
      />
    </View>
  );
}

function AmountChip({
  product,
  editMode,
  onAmountChange,
}: {
  product: Product;
  editMode: boolean;
  onAmountChange?: (n: number) => void;
}): JSX.Element {
  const { colors } = useAppTheme();
  const amount = product.amountInParent ?? 1;
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const inputValue = draftValue ?? String(amount);

  const commit = (n: number) => {
    const clamped = Math.min(Math.max(n, 1), 10000);
    onAmountChange?.(clamped);
    setDraftValue(null);
  };

  const handleTextChange = (text: string) => {
    const numeric = text.replace(/[^0-9]/g, '');
    setDraftValue(numeric);
    if (numeric !== '') commit(parseInt(numeric, 10));
  };

  const handleBlur = () => {
    if (inputValue === '' || inputValue === '0') {
      commit(1);
      return;
    }
    setDraftValue(null);
  };

  return (
    <View style={[amountStyles.container, { backgroundColor: colors.primaryContainer }]}>
      <View style={amountStyles.titleRow}>
        <Text style={[amountStyles.titleText, { color: colors.onPrimaryContainer }]}>Amount</Text>
        <InfoTooltip title="How many times this component occurs in its parent" />
      </View>
      {editMode ? (
        <View style={[amountStyles.editorRow, { backgroundColor: colors.primary }]}>
          <Pressable
            onPress={() => commit(amount - 1)}
            disabled={amount <= 1}
            style={({ pressed }) => [
              amountStyles.stepBtn,
              (pressed || amount <= 1) && { opacity: 0.4 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Decrease amount"
          >
            <MaterialCommunityIcons name="minus" size={14} color={colors.onPrimary} />
          </Pressable>
          <TextInput
            value={inputValue}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            keyboardType="numeric"
            style={[amountStyles.input, { color: colors.onPrimary }]}
            accessibilityLabel="Amount"
          />
          <Pressable
            onPress={() => commit(amount + 1)}
            disabled={amount >= 10000}
            style={({ pressed }) => [
              amountStyles.stepBtn,
              (pressed || amount >= 10000) && { opacity: 0.4 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Increase amount"
          >
            <MaterialCommunityIcons name="plus" size={14} color={colors.onPrimary} />
          </Pressable>
        </View>
      ) : (
        <Text
          style={[
            amountStyles.valueText,
            { backgroundColor: colors.primary, color: colors.onPrimary },
          ]}
        >
          {String(amount)}
        </Text>
      )}
    </View>
  );
}

const amountStyles = StyleSheet.create({
  container: {
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    paddingVertical: 8,
    paddingLeft: 12,
    fontWeight: '500',
    fontSize: 15,
  },
  valueText: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    fontWeight: '500',
    fontSize: 15,
  },
  editorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 30,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: 36,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
});
