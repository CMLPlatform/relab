import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type JSX, useCallback, useState } from 'react';
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Chip } from '@/components/base/Chip';
import { useDialog } from '@/components/base/dialogContext';
import FilterSelectionModal from '@/components/base/FilterSelectionModal';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { Text } from '@/components/base/Text';
import { useSearchBrandsQuery } from '@/features/products/queries';
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

  const closeBrandModal = useCallback(() => setBrandModalVisible(false), []);
  const handleBrandSelection = useCallback(
    (vals: string[]) => {
      onBrandChange?.(vals.length > 0 ? vals[0] : '');
    },
    [onBrandChange],
  );

  const onEditBrand = () => {
    if (!editMode) return;
    setBrandModalVisible(true);
  };

  const onEditModel = () => {
    if (!editMode) return;
    dialog.input({
      title: 'Set model',
      placeholder: 'Model name',
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
      {isComponent ? (
        <AmountChip product={product} editMode={editMode} onAmountChange={onAmountChange} />
      ) : null}

      <FilterSelectionModal
        visible={brandModalVisible}
        onDismiss={closeBrandModal}
        title="Select brand"
        items={brandResults ?? []}
        isLoading={brandsLoading}
        selectedValues={product.brand ? [product.brand] : []}
        onSelectionChange={handleBrandSelection}
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

  const commit = useCallback(
    (n: number) => {
      const clamped = Math.min(Math.max(n, 1), 10000);
      onAmountChange?.(clamped);
      setDraftValue(null);
    },
    [onAmountChange],
  );

  const handleTextChange = useCallback(
    (text: string) => {
      const numeric = text.replace(/[^0-9]/g, '');
      setDraftValue(numeric);
      if (numeric !== '') {
        commit(parseInt(numeric, 10));
      }
    },
    [commit],
  );

  const handleBlur = useCallback(() => {
    if (inputValue === '' || inputValue === '0') {
      commit(1);
      return;
    }
    setDraftValue(null);
  }, [inputValue, commit]);

  const decrease = useCallback(() => commit(amount - 1), [commit, amount]);
  const increase = useCallback(() => commit(amount + 1), [commit, amount]);

  return (
    <View style={[amountStyles.container, { backgroundColor: colors.primaryContainer }]}>
      <View style={amountStyles.titleRow}>
        <Text style={[amountStyles.titleText, { color: colors.onPrimaryContainer }]}>Amount</Text>
        <InfoTooltip title="How many times this component occurs in its parent" />
      </View>
      {editMode ? (
        <View style={[amountStyles.editorRow, { backgroundColor: colors.primary }]}>
          <StepButton
            icon="minus"
            color={colors.onPrimary}
            onPress={decrease}
            disabled={amount <= 1}
            label="Decrease amount"
          />
          <TextInput
            value={inputValue}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            keyboardType="numeric"
            style={[amountStyles.input, { color: colors.onPrimary }]}
            accessibilityLabel="Amount"
          />
          <StepButton
            icon="plus"
            color={colors.onPrimary}
            onPress={increase}
            disabled={amount >= 10000}
            label="Increase amount"
          />
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

function StepButton({
  icon,
  color,
  onPress,
  disabled,
  label,
}: {
  icon: 'minus' | 'plus';
  color: string;
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      amountStyles.stepBtn,
      (pressed || disabled) && { opacity: 0.4 },
    ],
    [disabled],
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={14} color={color} />
    </Pressable>
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
