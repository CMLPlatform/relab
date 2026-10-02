import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { PRESS_TINT } from '@/components/base/pressFeedback';
import type { MissingField } from '@/features/products/missingFields';
import { cn } from '@/utils/cn';

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
    <View testID="missing-fields-notice" className="flex-row flex-wrap items-baseline gap-x-1 px-4">
      {/* Each item below already carries its own "Jump to X" label; this text
          node is what assistive tech reads for "Not recorded yet:" itself, so the
          wrapping View needs no label of its own (a generic View would not
          reliably announce one anyway). */}
      <AppText variant="caption" className="text-muted-foreground">
        Not recorded yet:
      </AppText>
      {fields.map((field, index) => (
        <Pressable
          key={field.id}
          // biome-ignore lint/performance/noJsxPropsBind: the handler needs this item's field; the list is a handful of items.
          onPress={() => onPressField(field)}
          className={cn('min-h-11 justify-center rounded-md', PRESS_TINT)}
          accessibilityRole="link"
          accessibilityLabel={`Jump to ${field.label}`}
        >
          <AppText variant="caption" className="text-muted-foreground underline">
            {field.label}
            {index === fields.length - 1 ? '' : ','}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
