import { useCallback, useId, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { FormFieldError } from '@/components/base/FormField';
import { TextInput } from '@/components/base/TextInput';
import { PRODUCT_NAME_MAX_LENGTH, productSchema } from '@/services/api/validation/productSchema';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { describedBy } from '@/utils/a11y';
import { type SpecFact, SpecFacts } from './SpecFacts';
import { formatWeight } from './spec-utils';

function buildFacts(product: Product): SpecFact[] {
  const facts: SpecFact[] = [];
  const componentCount = product.components?.length ?? 0;
  if (componentCount > 0) facts.push({ label: 'Components', value: String(componentCount) });
  const { weight, width, height, depth } = product.physicalProperties ?? {};
  if (weight) facts.push({ label: 'Weight', value: formatWeight(weight) });
  if (width && height && depth) {
    facts.push({ label: 'Size', value: `${width}×${height}×${depth} cm` });
  }
  return facts;
}

/**
 * Edit-mode name field at display scale. The biggest text on the screen is
 * the control, not a copy of it — the stack header shows the name as plain
 * text in both modes. Keeps a local draft so a hydration mid-typing doesn't
 * clobber the buffer, and commits the trimmed value on blur.
 */
function NameField({
  name,
  onNameChange,
}: {
  name: string | undefined;
  onNameChange?: (newName: string) => void;
}) {
  const { tokens } = useAppTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const errorId = useId();
  const value = draft ?? name ?? '';

  const handleBlur = useCallback(() => {
    const trimmedValue = value.trim();
    if (trimmedValue !== name) {
      onNameChange?.(trimmedValue);
    }
  }, [value, name, onNameChange]);

  // The colour change alone carried the whole signal, which is invisible to a
  // screen reader and to anyone who can't distinguish it (WCAG 1.4.1, 3.3.1).
  const errorMessage = productSchema.shape.name.safeParse(value.trim()).error?.issues[0]?.message;
  const isInvalid = errorMessage !== undefined;

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder="Product name"
        maxLength={PRODUCT_NAME_MAX_LENGTH}
        bordered
        // NOTE: the `display` ramp step, applied as a style because RN's
        // TextInput has no `variant` prop.
        style={[
          tokens.type.display,
          { paddingHorizontal: 8 },
          isInvalid && { borderColor: tokens.status.danger },
        ]}
        accessibilityLabel="Product name"
        {...describedBy(errorId, isInvalid)}
      />
      <FormFieldError errorId={errorId} message={errorMessage} />
    </View>
  );
}

/**
 * Spec-sheet identity block: the record's name, what it is, and its key
 * measurable facts — the "engineering documentation" voice of the brand.
 */
export function SpecHeader({
  product,
  editMode = false,
  onNameChange,
}: {
  product: Product;
  editMode?: boolean;
  onNameChange?: (newName: string) => void;
}) {
  const identity = [product.productTypeName, product.brand, product.model]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-2 px-4 py-3">
      {editMode ? (
        // Key on product identity: the detail screen stays mounted across
        // product navigation, so remounting per product drops a stale draft.
        <NameField key={product.id} name={product.name} onNameChange={onNameChange} />
      ) : (
        <AppText variant="display">{product.name}</AppText>
      )}
      {identity ? (
        <AppText variant="body" className="text-muted-foreground">
          {identity}
        </AppText>
      ) : null}
      <SpecFacts facts={buildFacts(product)} />
    </View>
  );
}
