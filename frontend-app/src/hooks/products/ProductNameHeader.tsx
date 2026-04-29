import { useState } from 'react';
import { type ColorValue, View } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import { Text } from 'react-native-paper';
import { TextInput } from '@/components/base/TextInput';
import { truncateHeaderLabel } from '@/hooks/products/truncateHeaderLabel';
import { PRODUCT_NAME_MAX_LENGTH, productSchema } from '@/services/api/validation/productSchema';

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
  name: string;
  editMode: boolean;
  theme: MD3Theme;
  onProductNameChange?: (newName: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;

  if (!editMode) {
    return (
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: '700' }}>
        {truncateHeaderLabel(name, 36)}
      </Text>
    );
  }

  const trimmed = value.trim();
  const isInvalid = !productSchema.shape.name.safeParse(trimmed).success;

  return (
    <View style={{ flexShrink: 1, minWidth: 160 }}>
      <TextInput
        value={value}
        onChangeText={setDraft}
        onBlur={() => {
          if (trimmed !== name) onProductNameChange?.(trimmed);
        }}
        placeholder="Product name"
        maxLength={PRODUCT_NAME_MAX_LENGTH}
        style={{
          fontSize: 16,
          fontWeight: '700',
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: 6,
          backgroundColor: isInvalid
            ? theme.colors.errorContainer
            : (theme.colors.surfaceVariant as ColorValue),
        }}
        accessibilityLabel="Product name"
      />
    </View>
  );
}
