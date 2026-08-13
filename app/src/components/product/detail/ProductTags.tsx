import { type JSX, useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, type PressableStateCallbackType, TextInput, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Chip } from '@/components/base/Chip';
import { useDialog } from '@/components/base/dialogContext';
import { SingleSelectFilterModal } from '@/components/base/FilterSelectionModal';
import { Icon } from '@/components/base/Icon';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { MIN_TAP_TARGET } from '@/constants';
import { useSearchBrandsQuery } from '@/features/products/queries';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { AmountDraftFlushContext } from './amountDraftFlush';

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
  const theme = useAppTheme();

  const isBrandRequired = !isComponent;
  const isModelRequired = !isComponent;

  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(brandSearch);

  const closeBrandModal = useCallback(() => setBrandModalVisible(false), []);
  const handleBrandSelection = useCallback(
    (value: string) => onBrandChange?.(value),
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
    <View className="my-3 px-4 gap-2.5 flex-row flex-wrap">
      <Chip
        title={'Brand'}
        onPress={onEditBrand}
        icon={editMode && <Icon name="pencil" color={theme.colors.onPrimary} />}
        error={isBrandRequired && !product.brand}
      >
        {product.brand ?? 'Unknown'}
      </Chip>
      <Chip
        title={'Model'}
        onPress={onEditModel}
        icon={editMode && <Icon name="pencil" color={theme.colors.onPrimary} />}
        error={isModelRequired && !product.model}
      >
        {product.model ?? 'Unknown'}
      </Chip>
      {isComponent ? (
        <AmountChip product={product} editMode={editMode} onAmountChange={onAmountChange} />
      ) : null}

      <SingleSelectFilterModal
        visible={brandModalVisible}
        onDismiss={closeBrandModal}
        title="Select brand"
        items={brandResults ?? []}
        isLoading={brandsLoading}
        value={product.brand ?? ''}
        onValueChange={handleBrandSelection}
        searchQuery={brandSearch}
        onSearchChange={setBrandSearch}
        searchPlaceholder="Search or type a brand…"
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
  const { colors, tokens } = useAppTheme();
  const amount = product.amountInParent ?? 1;
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const inputValue = draftValue ?? String(amount);
  // What +/- should step from: the typed-but-uncommitted digits when present
  // (so typing then tapping a stepper doesn't discard what was just typed),
  // the last committed amount otherwise.
  const effectiveAmount =
    draftValue === null
      ? amount
      : Math.min(Math.max(draftValue === '' ? 1 : parseInt(draftValue, 10), 1), 10000);

  const commit = useCallback(
    (n: number): number => {
      const clamped = Math.min(Math.max(n, 1), 10000);
      onAmountChange?.(clamped);
      setDraftValue(null);
      return clamped;
    },
    [onAmountChange],
  );

  // Draft-only on keystroke — commit happens on blur/submit so a typed "25"
  // doesn't briefly commit "2" then "25" (each keystroke used to fire
  // onAmountChange, which the parent form treats as a dirty edit).
  const handleTextChange = useCallback((text: string) => {
    setDraftValue(text.replace(/[^0-9]/g, ''));
  }, []);

  const commitDraft = useCallback((): number | undefined => {
    if (draftValue === null) return undefined;
    return commit(draftValue === '' ? 1 : parseInt(draftValue, 10));
  }, [draftValue, commit]);

  // Save can fire before this input blurs (blur-before-press is convention,
  // not a contract, in RN) — register the flush so saveAndExit can pull any
  // pending draft deterministically instead of losing it. See amountDraftFlush.ts.
  const flushRef = useContext(AmountDraftFlushContext);
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = commitDraft;
    return () => {
      if (flushRef.current === commitDraft) flushRef.current = null;
    };
  }, [flushRef, commitDraft]);

  const decrease = useCallback(() => commit(effectiveAmount - 1), [commit, effectiveAmount]);
  const increase = useCallback(() => commit(effectiveAmount + 1), [commit, effectiveAmount]);

  return (
    <View
      className="rounded-md flex-row items-center"
      style={{ backgroundColor: tokens.surface.accent }}
    >
      <View className="flex-row items-center">
        <AppText
          variant="label"
          className="py-2 pl-3"
          style={[amountStyles.titleText, { color: colors.primary }]}
        >
          Amount
        </AppText>
        <InfoTooltip title="How many times this component occurs in its parent" />
      </View>
      {editMode ? (
        <View className="bg-primary flex-row items-center rounded-md overflow-hidden">
          <StepButton
            icon="minus"
            color={colors.onPrimary}
            onPress={decrease}
            disabled={effectiveAmount <= 1}
            label="Decrease amount"
          />
          <TextInput
            value={inputValue}
            onChangeText={handleTextChange}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="numeric"
            className="text-primary-foreground w-9 text-center py-2 px-0"
            style={amountStyles.input}
            accessibilityLabel="Amount"
            accessibilityHint="Enter a whole number from 1 to 10000; out-of-range values are adjusted to fit"
          />
          <StepButton
            icon="plus"
            color={colors.onPrimary}
            onPress={increase}
            disabled={effectiveAmount >= 10000}
            label="Increase amount"
          />
        </View>
      ) : (
        <AppText
          variant="data"
          className="bg-primary text-primary-foreground rounded-md py-2 px-3"
          style={amountStyles.valueText}
        >
          {String(amount)}
        </AppText>
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
      // No className on this Pressable: it would drop this function (see IconButton.tsx).
      styles.iconSlot,
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
      <Icon name={icon} size={14} color={color} />
    </Pressable>
  );
}

// fontSize 15/fontWeight 500 has no matching lineHeight, so it stays
// style-driven for all three call sites.
const amountText = { fontWeight: '500', fontSize: 15 } as const;
const amountStyles = { titleText: amountText, valueText: amountText, input: amountText };

const styles = {
  iconSlot: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
} as const;
