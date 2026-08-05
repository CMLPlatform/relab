import { useCallback, useId, useState } from 'react';
import { type ColorValue, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { FormFieldError } from '@/components/base/FormField';
import { TextInput } from '@/components/base/TextInput';
import { radius } from '@/constants';
import { truncateHeaderLabel } from '@/features/products/truncateHeaderLabel';
import { PRODUCT_NAME_MAX_LENGTH, productSchema } from '@/services/api/validation/productSchema';
import type { AppTheme } from '@/theme';
import { describedBy } from '@/utils/a11y';

/**
 * Header title for the product detail screen. In view mode it renders the
 * name as plain text (truncated to fit the header). In edit mode it becomes a
 * single-line editable input so the header itself is the name field — no
 * duplicate "Product name" row in the body of the form.
 */
export function ProductNameHeader({
  name,
  editMode,
  theme,
  onProductNameChange,
}: {
  name: string | undefined;
  editMode: boolean;
  theme: AppTheme;
  onProductNameChange?: (newName: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const errorId = useId();
  const value = draft ?? name ?? '';

  const handleBlur = useCallback(() => {
    const trimmedValue = value.trim();
    if (trimmedValue !== name) {
      onProductNameChange?.(trimmedValue);
    }
  }, [value, name, onProductNameChange]);

  if (!editMode) {
    return (
      <AppText numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: '700' }}>
        {truncateHeaderLabel(name, 36)}
      </AppText>
    );
  }

  const trimmed = value.trim();
  // The colour change alone carried the whole signal, which is invisible to a
  // screen reader and to anyone who can't distinguish it (WCAG 1.4.1, 3.3.1).
  const errorMessage = productSchema.shape.name.safeParse(trimmed).error?.issues[0]?.message;
  const isInvalid = errorMessage !== undefined;

  return (
    <View style={{ flexShrink: 1, minWidth: 160 }}>
      <TextInput
        value={value}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder="Product name"
        maxLength={PRODUCT_NAME_MAX_LENGTH}
        style={{
          fontSize: 16,
          fontWeight: '700',
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: radius.control,
          backgroundColor: isInvalid
            ? theme.colors.errorContainer
            : (theme.colors.surfaceVariant as ColorValue),
        }}
        accessibilityLabel="Product name"
        {...describedBy(errorId, isInvalid)}
      />
      <FormFieldError errorId={errorId} message={errorMessage} />
    </View>
  );
}
