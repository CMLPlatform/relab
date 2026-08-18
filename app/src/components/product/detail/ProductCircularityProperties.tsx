import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { TextInput } from '@/components/base/TextInput';
import { DOCS_URL } from '@/config';
import { openExternalUrl } from '@/services/externalLinks';
import { type AppColors, useAppTheme } from '@/theme';
import type { CircularityProperties, Product } from '@/types/Product';

type CircularityNoteKey = keyof CircularityProperties;

// The placeholders are the onboarding. These three free-text notes are the
// product's distinguishing research input and the hardest fields to write into
// cold: the labels are domain vocabulary, and a contributor who does not know
// what a good answer looks like writes nothing. Each example is deliberately
// hedged, because the guidance is that an uncertain observation is a good
// observation and a forced-precise one damages the dataset.
const NOTE_FIELDS: readonly { key: CircularityNoteKey; label: string; example: string }[] = [
  {
    key: 'recyclability',
    label: 'Recyclability',
    example: 'e.g. Housing likely polypropylene, unconfirmed — no resin code moulded in.',
  },
  {
    key: 'disassemblability',
    label: 'Disassemblability',
    example: 'e.g. Opens with 6 Torx T10; battery is glued, had to be prised.',
  },
  {
    key: 'remanufacturability',
    label: 'Remanufacturability',
    example: 'e.g. Motor and gearbox look reusable; control board is potted.',
  },
];

interface Props {
  product: Product;
  editMode: boolean;
  onChangeCircularityProperties?: (newProperties: CircularityProperties) => void;
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function visibleNoteCount(properties: CircularityProperties): number {
  return NOTE_FIELDS.filter(({ key }) => hasContent(properties[key])).length;
}

function getHiddenSummary(count: number): string {
  if (count === 0) return 'No associated circularity properties.';
  return `${count} ${count === 1 ? 'property' : 'properties'} hidden.`;
}

export default function ProductCircularityProperties({
  product,
  editMode,
  onChangeCircularityProperties,
}: Props) {
  const { colors } = useAppTheme();
  // Expanded in edit mode. Collapsed-by-default made "Add circularity notes"
  // (Section's ghost add-row) open onto "No associated circularity properties."
  // plus a Show link — three taps to reach a textarea, the middle one answering
  // a request to add with a statement that there is nothing. The collapse earns
  // its place in view mode, where it saves scroll on a long record.
  //
  // The effect is load-bearing, not belt-and-braces: `useState(editMode)` alone
  // only covers the mount-in-edit-mode path (the empty-section add-row). Section
  // keys its children by `sectionKey`, so a record opened in view mode stays
  // mounted when the user presses Edit, and the initialiser never re-runs —
  // which left the notes collapsed behind "3 properties hidden." on the path
  // users actually take through an existing record.
  const [isSectionExpanded, setIsSectionExpanded] = useState(editMode);
  // Adjust-state-during-render rather than an effect: React's documented pattern
  // for reacting to a prop change, and it avoids the cascading re-render an
  // effect-plus-setState would cause. Entering edit mode opens the section;
  // leaving it does not force a collapse, and "Hide" still works in both modes.
  const [wasEditMode, setWasEditMode] = useState(editMode);
  if (editMode !== wasEditMode) {
    setWasEditMode(editMode);
    if (editMode) setIsSectionExpanded(true);
  }
  const circularityProperties = product.circularityProperties;
  const noteCount = visibleNoteCount(circularityProperties);
  const toggleSectionLabel = isSectionExpanded ? 'Hide' : 'Show';

  const toggleSection = useCallback(() => setIsSectionExpanded((value) => !value), []);
  const updateNote = useCallback(
    (key: CircularityNoteKey, value: string) => {
      onChangeCircularityProperties?.({
        ...circularityProperties,
        [key]: value,
      });
    },
    [circularityProperties, onChangeCircularityProperties],
  );

  return (
    <View>
      {/* The Section title ("Circularity") already covers this heading — this
          row is only the collapse/expand toggle, right-aligned to where
          DetailSectionHeader's rightElement used to sit. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Pressable
          onPress={toggleSection}
          accessibilityRole="button"
          accessibilityLabel={`${toggleSectionLabel.toLowerCase()} circularity properties`}
        >
          <AppText variant="body" style={{ fontWeight: '600', color: colors.primary }}>
            {toggleSectionLabel}
          </AppText>
        </Pressable>
      </View>

      {!isSectionExpanded ? (
        <AppText className="mb-2 opacity-70">{getHiddenSummary(noteCount)}</AppText>
      ) : (
        <View className="gap-3">
          {NOTE_FIELDS.map(({ key, label, example }) => {
            const value = circularityProperties[key] ?? '';
            if (!editMode && !hasContent(value)) {
              return null;
            }

            return (
              <CircularityNoteField
                key={key}
                noteKey={key}
                label={label}
                example={example}
                value={value}
                editMode={editMode}
                colors={colors}
                onUpdate={updateNote}
              />
            );
          })}
          {!editMode && noteCount === 0 ? (
            <AppText className="mb-2 text-muted-foreground">
              No associated circularity properties.
            </AppText>
          ) : null}
          {editMode && DOCS_URL ? <CircularityGuideLink /> : null}
        </View>
      )}
    </View>
  );
}

function CircularityNoteField({
  noteKey,
  label,
  example,
  value,
  editMode,
  colors,
  onUpdate,
}: {
  noteKey: CircularityNoteKey;
  label: string;
  example: string;
  value: string;
  editMode: boolean;
  colors: AppColors;
  onUpdate: (key: CircularityNoteKey, value: string) => void;
}) {
  const handleChangeText = useCallback(
    (text: string) => onUpdate(noteKey, text),
    [onUpdate, noteKey],
  );

  return (
    <View className="py-[14px]">
      <AppText variant="body" className="text-[18px] font-semibold">
        {label}
      </AppText>
      {editMode ? (
        <TextInput
          value={value}
          onChangeText={handleChangeText}
          multiline
          numberOfLines={3}
          maxLength={500}
          placeholder={example}
          placeholderTextColor={colors.onSurfaceVariant}
          className="min-h-20 rounded-md border p-3 text-[16px]"
          style={{
            textAlignVertical: 'top',
            borderColor: colors.outline,
            backgroundColor: colors.surface,
            color: colors.onSurface,
          }}
        />
      ) : (
        <AppText className="mb-2 opacity-70" style={{ color: colors.onSurface }}>
          {value}
        </AppText>
      )}
    </View>
  );
}

const DATA_COLLECTION_DOCS_PATH = '/user-guides/data-collection';

/**
 * The only route from the capture surfaces into the documentation.
 *
 * The estate has 26 published guide pages and, before this, exactly two in-app
 * links to any of them — both buried in Account settings, neither reachable
 * while recording. The guidance that resolves most of the confusion around
 * these three fields (what counts as an observation, and that leaving one empty
 * beats forcing a guess) lives in the data-collection guide, so it is linked
 * from the field it explains rather than from a settings screen.
 */
function CircularityGuideLink() {
  const openGuide = useCallback(() => {
    if (DOCS_URL) {
      void openExternalUrl(new URL(DATA_COLLECTION_DOCS_PATH, DOCS_URL).toString());
    }
  }, []);

  return (
    <Pressable
      onPress={openGuide}
      accessibilityRole="link"
      accessibilityLabel="Read the data collection guide"
      className="justify-center py-2"
    >
      <AppText variant="caption" className="text-primary underline">
        How to record circularity notes
      </AppText>
    </Pressable>
  );
}
