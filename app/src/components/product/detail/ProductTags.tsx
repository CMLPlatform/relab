import { type JSX, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { disabledTreatment } from '@/components/base/appButtonVariants';
import { Chip } from '@/components/base/Chip';
import { useDialog } from '@/components/base/dialogContext';
import { SingleSelectFilterModal } from '@/components/base/FilterSelectionModal';
import { Icon } from '@/components/base/Icon';
import { InfoTooltip } from '@/components/base/InfoTooltip';
import { PRESS_FADE, type PressState, pressFill } from '@/components/base/pressFeedback';
import { MIN_TAP_TARGET } from '@/constants';
import { AmountDraftFlushContext } from '@/features/products/amountDraftFlush';
import { useSearchBrandsQuery } from '@/features/products/queries';
import { useAppTheme } from '@/theme/appThemeContext';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
  onBrandChange?: (newBrand: string) => void;
  onModelChange?: (newModel: string) => void;
  onAmountChange?: (newAmount: number) => void;
  isComponent?: boolean;
}

/** Edit-mode brand, model and amount controls; view mode states them in OverviewFacts. */
export default function ProductTags({
  product,
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

  const onEditBrand = () => setBrandModalVisible(true);

  const onEditModel = () => {
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
        onPress={onEditBrand}
        icon={<Icon name="pencil" color={theme.colors.onPrimary} />}
      >
        {product.brand ?? 'Not recorded'}
      </Chip>
      <Chip
        title={'Model'}
        onPress={onEditModel}
        icon={<Icon name="pencil" color={theme.colors.onPrimary} />}
      >
        {product.model ?? 'Not recorded'}
      </Chip>
      {isComponent ? <AmountChip product={product} onAmountChange={onAmountChange} /> : null}

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

/** Edit-mode amount stepper; view mode states the amount as a spec fact. */
function AmountChip({
  product,
  onAmountChange,
}: {
  product: Product;
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
  const theme = useAppTheme();
  // The one disabled treatment (DESIGN.md Buttons), never an opacity fade.
  const inert = useMemo(() => (disabled ? disabledTreatment(theme) : null), [disabled, theme]);
  const style = useCallback(
    (state: PressState) => [
      styles.iconSlot,
      inert
        ? { backgroundColor: inert.fill, borderColor: inert.border, borderWidth: 1 }
        : // On the chip's solid-primary value segment: a filled control, so primary-strong.
          pressFill(state, theme.colors.primaryStrong),
    ],
    [inert, theme.colors.primaryStrong],
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={PRESS_FADE}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={14} color={inert ? inert.ink : color} />
    </Pressable>
  );
}

// NOTE: 13/500 is Chip's own face (the label step, font-medium), shared by title
// and input so the Amount chip reads at the same size as Brand and Model.
const amountText = { fontWeight: '500', fontSize: 13 } as const;
const amountStyles = { titleText: amountText, input: amountText };

const styles = {
  iconSlot: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
} as const;
