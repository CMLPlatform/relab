import { type JSX, useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Chip } from '@/components/base/Chip';
import { useDialog } from '@/components/base/dialogContext';
import { SingleSelectFilterModal } from '@/components/base/FilterSelectionModal';
import { Icon } from '@/components/base/Icon';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { type PressState, pressFill } from '@/components/base/pressFeedback';
import { MIN_TAP_TARGET } from '@/constants';
import { AmountDraftFlushContext } from '@/features/products/amountDraftFlush';
import { useSearchBrandsQuery } from '@/features/products/queries';
import { useAppTheme } from '@/theme/appThemeContext';
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
  const theme = useAppTheme();

  // Brand and model are not required: an empty field must never render as an
  // error (PRODUCT.md). An unbranded item is a legitimate record.

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
    <View className="my-3 gap-2.5 flex-row flex-wrap">
      <Chip
        title={'Brand'}
        readOnly={!editMode}
        onPress={onEditBrand}
        icon={editMode && <Icon name="pencil" color={theme.colors.onPrimary} />}
      >
        {product.brand ?? 'Not recorded'}
      </Chip>
      <Chip
        title={'Model'}
        readOnly={!editMode}
        onPress={onEditModel}
        icon={editMode && <Icon name="pencil" color={theme.colors.onPrimary} />}
      >
        {product.model ?? 'Not recorded'}
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
  // +/- step from the uncommitted digits when present, else the committed amount.
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

  // Draft on keystroke, commit on blur/submit, so "25" does not commit "2" first.
  const handleTextChange = useCallback((text: string) => {
    setDraftValue(text.replace(/[^0-9]/g, ''));
  }, []);

  const commitDraft = useCallback((): number | undefined => {
    if (draftValue === null) return undefined;
    const committed = commit(draftValue === '' ? 1 : parseInt(draftValue, 10));
    // saveAndExit counts any returned number as a dirty edit, so an unchanged
    // value must return undefined.
    return committed === amount ? undefined : committed;
  }, [amount, draftValue, commit]);

  // Save can fire before this input blurs; see amountDraftFlush.ts.
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
      style={{ backgroundColor: tokens.surface.accent, minHeight: MIN_TAP_TARGET }}
    >
      <View className="flex-row items-center">
        <AppText
          variant="label"
          className="py-2 pl-3"
          style={[amountStyles.titleText, { color: colors.primary }]}
        >
          Amount
        </AppText>
        <InfoTooltip title="How many of this component the parent contains" />
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
            maxFontSizeMultiplier={2}
            className="text-primary-foreground min-w-9 text-center py-2 px-1"
            style={amountStyles.input}
            accessibilityLabel="Amount"
            accessibilityHint="Enter a whole number from 1 to 10000. Relab corrects a value outside that range."
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
        // Full chip height, like Brand and Model's value segment beside it.
        <View className="bg-primary self-stretch justify-center rounded-md px-3">
          <AppText
            variant="data"
            className="text-primary-foreground"
            style={amountStyles.valueText}
          >
            {String(amount)}
          </AppText>
        </View>
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
  const { colors } = useAppTheme();
  const style = useCallback(
    (state: PressState) => [
      // No className on this Pressable: it would drop this function (see IconButton.tsx).
      styles.iconSlot,
      // On the chip's solid-primary value segment: a filled control, so primary-strong.
      disabled ? { opacity: 0.4 } : pressFill(state, colors.primaryStrong),
    ],
    [disabled, colors.primaryStrong],
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

// NOTE: 13/500 is Chip's own face (the label step, font-medium), shared by title,
// value and input so the Amount chip reads at the same size as Brand and Model.
const amountText = { fontWeight: '500', fontSize: 13 } as const;
const amountStyles = { titleText: amountText, valueText: amountText, input: amountText };

const styles = {
  iconSlot: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
} as const;
