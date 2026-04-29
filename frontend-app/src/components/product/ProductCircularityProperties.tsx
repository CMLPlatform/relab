import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { TextInput } from '@/components/base/TextInput';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { styles } from '@/components/product/circularity/styles';
import { useAppTheme } from '@/theme';
import type { CircularityProperties, Product } from '@/types/Product';

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

  const updateNote = (key: CircularityNoteKey, value: string) => {
    onChangeCircularityProperties?.({
      ...circularityProperties,
      [key]: value,
    });
  };

  return (
    <View>
      <DetailSectionHeader
        title="Circularity Properties"
        tooltipTitle="Add optional recyclability, disassemblability, and remanufacturability notes."
        rightElement={
          <Pressable
            onPress={() => setIsSectionExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={`${toggleSectionLabel.toLowerCase()} circularity properties`}
          >
            <Text style={{ fontWeight: '600', color: colors.primary }}>{toggleSectionLabel}</Text>
          </Pressable>
        }
      />

      {!isSectionExpanded ? (
        <Text style={styles.sectionSummary}>{getHiddenSummary(noteCount)}</Text>
      ) : (
        <View style={styles.propertyFields}>
          {NOTE_FIELDS.map(({ key, label }) => {
            const value = circularityProperties[key] ?? '';
            if (!editMode && !hasContent(value)) return null;

            return (
              <View key={key} style={styles.propertySection}>
                <Text style={styles.propertyTitle}>{label}</Text>
                {editMode ? (
                  <TextInput
                    value={value}
                    onChangeText={(text) => updateNote(key, text)}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
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
                  <Text style={[styles.sectionSummary, { color: colors.onSurface }]}>{value}</Text>
                )}
              </View>
            );
          })}
          {!editMode && noteCount === 0 ? (
            <Text style={styles.sectionSummary}>No associated circularity properties.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
