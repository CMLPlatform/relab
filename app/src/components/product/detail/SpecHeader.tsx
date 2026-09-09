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

/** Edit-mode name field at title scale. Local draft so hydration cannot clobber typing; commits trimmed on blur. */
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

  // Colour alone is not a signal (WCAG 1.4.1, 3.3.1).
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
        // NOTE: the `title` ramp step, applied as a style because RN's
        // TextInput has no `variant` prop. Display (38px) cut long names off
        // mid-word at phone width; view mode keeps the display heading.
        style={[
          tokens.type.title,
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

/** Spec-sheet identity block: name, type, key measurable facts. */
export function SpecHeader({
  product,
  editMode = false,
  saveStatus,
  onNameChange,
}: {
  product: Product;
  editMode?: boolean;
  /** Record status line ("Saved · ID 29"); rendered under the title as data. */
  saveStatus?: string;
  onNameChange?: (newName: string) => void;
}) {
  const identity = [product.productTypeName, product.brand, product.model]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-2 px-4 py-3">
      {editMode ? (
        // Keyed per product so a stale draft is dropped on navigation.
        <NameField key={product.id} name={product.name} onNameChange={onNameChange} />
      ) : (
        <AppText variant="display" accessibilityRole="header">
          {product.name}
        </AppText>
      )}
      {saveStatus ? (
        // Not a live region: DocumentChrome already announces "Saved", and
        // the queued state is toasted.
        <AppText variant="data" className="text-manila" testID="save-status">
          {saveStatus}
        </AppText>
      ) : null}
      {identity ? (
        <AppText variant="body" className="text-muted-foreground">
          {identity}
        </AppText>
      ) : null}
      <SpecFacts facts={buildFacts(product)} />
    </View>
  );
}
