import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { DocsLink } from '@/components/base/DocsLink';
import { TextInput } from '@/components/base/TextInput';
import { Separator } from '@/components/base/ui/separator';
import { DATA_COLLECTION_DOCS_PATH } from '@/config';
import { type AppColors, useAppTheme } from '@/theme';
import type { CircularityProperties, Product } from '@/types/Product';
import { heading } from '@/utils/a11y';

type CircularityNoteKey = keyof CircularityProperties;

// Each label carries a hint (the audience includes repair-café visitors) and a
// hedged example: an uncertain observation is a good observation.
const NOTE_FIELDS: readonly {
  key: CircularityNoteKey;
  label: string;
  hint: string;
  example: string;
}[] = [
  {
    key: 'recyclability',
    label: 'Recyclability',
    hint: 'What the parts are made of, and whether those materials can be separated and recovered.',
    example: 'e.g. Housing likely polypropylene, unconfirmed — no resin code moulded in.',
  },
  {
    key: 'disassemblability',
    label: 'Disassemblability',
    hint: 'How easily the product comes apart into its parts, and whether that damages them.',
    example: 'e.g. Opens with 6 Torx T10; battery is glued, had to be prised.',
  },
  {
    key: 'remanufacturability',
    label: 'Remanufacturability',
    hint: 'Whether whole parts could be cleaned up and used again in another product.',
    example: 'e.g. Motor and gearbox look reusable; control board is potted.',
  },
];

interface Props {
  product: Product;
  editMode: boolean;
  /** Takes one changed note; the form owner merges it into the live value. */
  onChangeCircularityProperties?: (patch: Partial<CircularityProperties>) => void;
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Three spec rows, always rendered: an unset note reads "—" like an unmeasured
 * dimension does. Empty is research data, not a gap to hide.
 */
export default function ProductCircularityProperties({
  product,
  editMode,
  onChangeCircularityProperties,
}: Props) {
  const { colors } = useAppTheme();
  const circularityProperties = product.circularityProperties;

  const updateNote = useCallback(
    (key: CircularityNoteKey, value: string) => {
      onChangeCircularityProperties?.({ [key]: value });
    },
    [onChangeCircularityProperties],
  );

  return (
    <View className="mt-4">
      <AppText variant="heading" {...heading(3)} className="mb-2 font-semibold">
        Circularity notes
      </AppText>
      {NOTE_FIELDS.map(({ key, label, hint, example }) => (
        <View key={key}>
          <Separator />
          <CircularityNoteField
            noteKey={key}
            label={label}
            hint={hint}
            example={example}
            value={circularityProperties[key] ?? ''}
            editMode={editMode}
            colors={colors}
            onUpdate={updateNote}
          />
        </View>
      ))}
      {/* The guidance that resolves most of the confusion around these three
          fields (what counts as an observation, and that leaving one empty
          beats forcing a guess) lives in the data-collection guide, so it
          is linked from the field it explains. */}
      {editMode ? (
        <DocsLink
          path={DATA_COLLECTION_DOCS_PATH}
          accessibilityLabel="Read the data collection guide"
        >
          How to record circularity notes
        </DocsLink>
      ) : null}
    </View>
  );
}

function CircularityNoteField({
  noteKey,
  label,
  hint,
  example,
  value,
  editMode,
  colors,
  onUpdate,
}: {
  noteKey: CircularityNoteKey;
  label: string;
  hint: string;
  example: string;
  value: string;
  editMode: boolean;
  colors: AppColors;
  onUpdate: (key: CircularityNoteKey, value: string) => void;
}) {
  // Local draft, committed on blur: the commit is what triggers the blur-save.
  const [draft, setDraft] = useState<string | null>(null);
  const handleBlur = useCallback(() => {
    if (draft !== null && draft !== value) onUpdate(noteKey, draft);
    setDraft(null);
  }, [draft, value, onUpdate, noteKey]);

  // Spec row (DESIGN.md): eyebrow label, then prose instead of a mono value.
  return (
    <View className="px-4 py-2">
      <AppText variant="eyebrow" className="text-manila">
        {label}
      </AppText>
      {editMode ? (
        <>
          <AppText variant="caption" className="mb-1 text-muted-foreground">
            {hint}
          </AppText>
          <TextInput
            value={draft ?? value}
            onChangeText={setDraft}
            onBlur={handleBlur}
            multiline
            numberOfLines={3}
            maxLength={500}
            placeholder={example}
            placeholderTextColor={colors.onSurfaceVariant}
            accessibilityLabel={label}
            className="min-h-20 rounded-md border p-3 text-base"
            style={{
              textAlignVertical: 'top',
              borderColor: colors.outline,
              backgroundColor: colors.surface,
              color: colors.onSurface,
            }}
          />
        </>
      ) : (
        <AppText>{hasContent(value) ? value : '—'}</AppText>
      )}
    </View>
  );
}
