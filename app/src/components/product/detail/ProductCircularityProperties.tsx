import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { TextInput } from '@/components/base/TextInput';
import { type AppColors, useAppTheme } from '@/theme';
import type { CircularityProperties, Product } from '@/types/Product';
import { styles } from './styles';

type CircularityNoteKey = keyof CircularityProperties;

const NOTE_FIELDS: readonly { key: CircularityNoteKey; label: string }[] = [
  { key: 'recyclability', label: 'Recyclability' },
  { key: 'disassemblability', label: 'Disassemblability' },
  { key: 'remanufacturability', label: 'Remanufacturability' },
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
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);
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
          <AppText variant="plain" style={{ fontWeight: '600', color: colors.primary }}>
            {toggleSectionLabel}
          </AppText>
        </Pressable>
      </View>

      {!isSectionExpanded ? (
        <AppText className="mb-2 opacity-70">{getHiddenSummary(noteCount)}</AppText>
      ) : (
        <View className="gap-3">
          {NOTE_FIELDS.map(({ key, label }) => {
            const value = circularityProperties[key] ?? '';
            if (!editMode && !hasContent(value)) {
              return null;
            }

            return (
              <CircularityNoteField
                key={key}
                noteKey={key}
                label={label}
                value={value}
                editMode={editMode}
                colors={colors}
                onUpdate={updateNote}
              />
            );
          })}
          {!editMode && noteCount === 0 ? (
            <AppText className="mb-2 opacity-70">No associated circularity properties.</AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}

function CircularityNoteField({
  noteKey,
  label,
  value,
  editMode,
  colors,
  onUpdate,
}: {
  noteKey: CircularityNoteKey;
  label: string;
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
      <AppText variant="plain" className="font-semibold" style={styles.propertyTitle}>
        {label}
      </AppText>
      {editMode ? (
        <TextInput
          value={value}
          onChangeText={handleChangeText}
          multiline
          numberOfLines={3}
          maxLength={500}
          className="min-h-20 rounded-md border p-3"
          style={[
            styles.input,
            styles.multilineInput,
            {
              borderColor: colors.outline,
              backgroundColor: colors.surface,
              color: colors.onSurface,
            },
          ]}
        />
      ) : (
        <AppText className="mb-2 opacity-70" style={{ color: colors.onSurface }}>
          {value}
        </AppText>
      )}
    </View>
  );
}
