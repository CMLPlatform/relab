import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import type { MissingField } from '@/features/products/missingFields';

function MissingFieldItem({
  field,
  isLast,
  onPressField,
}: {
  field: MissingField;
  isLast: boolean;
  onPressField: (field: MissingField) => void;
}) {
  const handlePress = useCallback(() => onPressField(field), [field, onPressField]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`Jump to ${field.label}`}
    >
      <AppText variant="caption" className="text-muted-foreground underline">
        {field.label}
        {isLast ? '' : ','}
      </AppText>
    </Pressable>
  );
}

/**
 * Owner-only "what's left to fill in" line (issue #325). Each item scrolls to
 * its section; hidden entirely when nothing is missing.
 */
export function MissingFieldsNotice({
  fields,
  onPressField,
}: {
  fields: MissingField[];
  onPressField: (field: MissingField) => void;
}) {
  if (fields.length === 0) return null;

  return (
    <View
      className="flex-row flex-wrap items-baseline gap-x-1 px-4"
      accessibilityLabel={`Missing: ${fields.map((field) => field.label).join(', ')}`}
    >
      <AppText variant="caption" className="text-muted-foreground">
        Missing:
      </AppText>
      {fields.map((field, index) => (
        <MissingFieldItem
          key={field.id}
          field={field}
          isLast={index === fields.length - 1}
          onPressField={onPressField}
        />
      ))}
    </View>
  );
}
