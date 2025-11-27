import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';
import { Chip, InfoTooltip, Text, TextInput } from '@/components/base';
import { CircularityProperties, Product } from '@/types/Product';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

interface Props {
  product: Product;
  editMode: boolean;
  onChangeCircularityProperties?: (newProperties: CircularityProperties) => void;
}

type CircularityPropertyType = 'recyclability' | 'remanufacturability' | 'repairability';

const propertyLabels: Record<CircularityPropertyType, string> = {
  recyclability: 'Recyclability',
  remanufacturability: 'Remanufacturability',
  repairability: 'Repairability',
};

// Separate component for rendering individual property sections
interface CircularityPropertySectionProps {
  type: CircularityPropertyType;
  circularityProperties: CircularityProperties;
  editMode: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onUpdateField: (field: 'comment' | 'observation' | 'reference', value: string) => void;
}

export default function ProductCircularityProperties({ product, editMode, onChangeCircularityProperties }: Props) {
  const darkMode = useColorScheme() === 'dark';
  const theme = darkMode ? DarkTheme : LightTheme;
  const [expandedProperty, setExpandedProperty] = useState<CircularityPropertyType | null>(null);

  // Helper function to check if a property has been added (exists in the data structure)
  const hasPropertyData = (type: CircularityPropertyType): boolean => {
    if (!product.circularityProperties) return false;

    const observationKey = `${type}Observation` as keyof CircularityProperties;
    const observation = product.circularityProperties[observationKey];

    // Check if observation field exists and is not null (even if empty string)
    // When a property is "removed", observation is set to empty string ''
    // When a property has never been added, observation would typically be ''
    // So we need to check if it's been explicitly added by checking all three fields
    const commentKey = `${type}Comment` as keyof CircularityProperties;
    const referenceKey = `${type}Reference` as keyof CircularityProperties;

    const comment = product.circularityProperties[commentKey];
    const reference = product.circularityProperties[referenceKey];

    // A property "has data" if ANY field has actual content OR
    // if the fields exist with non-null values (meaning it was explicitly added)
    // When removed, comment and reference are set to null, observation to ''
    return (
      (typeof observation === 'string' && observation.trim() !== '') ||
      (typeof comment === 'string' && comment.trim() !== '') ||
      (typeof reference === 'string' && reference.trim() !== '') ||
      // Also consider it as "having data" if comment or reference are empty strings (not null)
      // This means the property was added but not yet filled in
      comment !== null ||
      reference !== null
    );
  };

  // Helper function to update a specific field
  const updateField = (
    type: CircularityPropertyType,
    field: 'comment' | 'observation' | 'reference',
    value: string,
  ) => {
    if (!product.circularityProperties) return;

    const key = `${type}${field.charAt(0).toUpperCase()}${field.slice(1)}` as keyof CircularityProperties;
    const newProperties = {
      ...product.circularityProperties,
      [key]: value,
    };
    onChangeCircularityProperties?.(newProperties);
  };

  // Helper function to add a new property
  const addProperty = (type: CircularityPropertyType) => {
    const baseProperties = product.circularityProperties || {
      recyclabilityComment: null,
      recyclabilityObservation: '',
      recyclabilityReference: null,
      remanufacturabilityComment: null,
      remanufacturabilityObservation: '',
      remanufacturabilityReference: null,
      repairabilityComment: null,
      repairabilityObservation: '',
      repairabilityReference: null,
    };

    const newProperties = {
      ...baseProperties,
      [`${type}Comment`]: '',
      [`${type}Observation`]: '',
      [`${type}Reference`]: '',
    };

    onChangeCircularityProperties?.(newProperties);
    setExpandedProperty(type);
  };

  // Helper function to remove a property
  const removeProperty = (type: CircularityPropertyType) => {
    if (!product.circularityProperties) return;

    const newProperties = {
      ...product.circularityProperties,
      [`${type}Comment`]: null,
      [`${type}Observation`]: '',
      [`${type}Reference`]: null,
    };
    onChangeCircularityProperties?.(newProperties);
    setExpandedProperty(null);
  };

  const propertyTypes = ['recyclability', 'remanufacturability', 'repairability'] as CircularityPropertyType[];
  const chipsToShow = editMode ? propertyTypes.filter((type) => !hasPropertyData(type)) : [];
  const expandedPropertiesToShow = propertyTypes.filter((type) => hasPropertyData(type));

  return (
    <View>
      <Text style={styles.sectionTitle}>
        Circularity Properties{' '}
        <InfoTooltip title="Add recyclability, remanufacturability, and repairability information. Observation fields are required." />
      </Text>

      {/* Show message when no properties exist */}
      {expandedPropertiesToShow.length === 0 && !editMode && (
        <Text style={{ paddingHorizontal: 14, opacity: 0.7, marginBottom: 8 }}>
          No associated circularity properties.
        </Text>
      )}

      {/* Render chips in a single horizontal container */}
      {chipsToShow.length > 0 && (
        <View style={styles.chipContainer}>
          {chipsToShow.map((type) => (
            <Chip
              key={type}
              onPress={() => addProperty(type)}
              icon={<MaterialCommunityIcons name="plus" size={16} color={theme.colors.onPrimary} />}
            >
              {propertyLabels[type]}
            </Chip>
          ))}
        </View>
      )}

      {/* Render expanded properties */}
      {expandedPropertiesToShow.map(
        (type) =>
          product.circularityProperties && (
            <CircularityPropertySection
              key={type}
              type={type}
              circularityProperties={product.circularityProperties}
              editMode={editMode}
              isExpanded={expandedProperty === type}
              onToggleExpanded={() => setExpandedProperty(expandedProperty === type ? null : type)}
              onRemove={() => removeProperty(type)}
              onUpdateField={(field, value) => updateField(type, field, value)}
            />
          ),
      )}
    </View>
  );
}

function CircularityPropertySection({
  type,
  circularityProperties,
  editMode,
  isExpanded,
  onToggleExpanded,
  onRemove,
  onUpdateField,
}: CircularityPropertySectionProps) {
  const darkMode = useColorScheme() === 'dark';
  const theme = darkMode ? DarkTheme : LightTheme;

  const commentKey = `${type}Comment` as keyof CircularityProperties;
  const observationKey = `${type}Observation` as keyof CircularityProperties;
  const referenceKey = `${type}Reference` as keyof CircularityProperties;

  // Helper to check if a field has content
  const hasContent = (value: string | null | undefined): boolean => {
    return typeof value === 'string' && value.trim() !== '';
  };

  const observation = circularityProperties[observationKey];
  const comment = circularityProperties[commentKey];
  const reference = circularityProperties[referenceKey];

  return (
    <Fragment>
      <View style={[styles.divider, darkMode && styles.dividerDark]} />
      <View style={styles.propertySection}>
        <View style={styles.propertyHeader}>
          <Text style={styles.propertyTitle}>{propertyLabels[type]}</Text>
          <View style={styles.propertyActions}>
            <Pressable
              onPress={onToggleExpanded}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <MaterialCommunityIcons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={theme.colors.onSurface}
              />
            </Pressable>
            {editMode && (
              <Pressable
                onPress={onRemove}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              >
                <MaterialCommunityIcons name="delete" size={24} color={theme.colors.onSurface} />
              </Pressable>
            )}
          </View>
        </View>

        {isExpanded && (
          <View style={styles.propertyFields}>
            {/* Observation field - always show in edit mode, only show if has content in view mode */}
            {(editMode || hasContent(observation)) && (
              <View>
                <Text style={[styles.label, darkMode && styles.labelDark]}>Observation (Required)</Text>
                <TextInput
                  value={String(observation || '')}
                  onChangeText={(text) => onUpdateField('observation', text)}
                  multiline
                  numberOfLines={3}
                  editable={editMode}
                  style={[
                    styles.input,
                    styles.multilineInput,
                    darkMode && styles.inputDark,
                    editMode && !observation && styles.inputError,
                    editMode && !observation && darkMode && styles.inputErrorDark,
                  ]}
                  errorOnEmpty={editMode && !observation}
                />
              </View>
            )}

            {/* Comment field - always show in edit mode, only show if has content in view mode */}
            {(editMode || hasContent(comment)) && (
              <View>
                <Text style={[styles.label, darkMode && styles.labelDark]}>Comment (Optional)</Text>
                <TextInput
                  value={String(comment || '')}
                  onChangeText={(text) => onUpdateField('comment', text)}
                  multiline
                  numberOfLines={2}
                  editable={editMode}
                  style={[styles.input, styles.multilineInput, darkMode && styles.inputDark]}
                />
              </View>
            )}

            {/* Reference field - always show in edit mode, only show if has content in view mode */}
            {(editMode || hasContent(reference)) && (
              <View>
                <Text style={[styles.label, darkMode && styles.labelDark]}>Reference (Optional)</Text>
                <TextInput
                  value={String(reference || '')}
                  onChangeText={(text) => onUpdateField('reference', text)}
                  editable={editMode}
                  style={[styles.input, darkMode && styles.inputDark]}
                  placeholder="e.g., ISO 14021:2016"
                />
              </View>
            )}
          </View>
        )}
      </View>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: 12,
    paddingLeft: 14,
    fontSize: 24,
    fontWeight: 'bold',
  },
  chipContainer: {
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: LightTheme.colors.outlineVariant,
  },
  dividerDark: {
    backgroundColor: DarkTheme.colors.outlineVariant,
  },
  propertySection: {
    padding: 14,
  },
  propertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  propertyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
  },
  iconButtonPressed: {
    opacity: 0.6,
    backgroundColor: LightTheme.colors.surfaceVariant,
  },
  propertyFields: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: LightTheme.colors.onSurfaceVariant,
  },
  labelDark: {
    color: DarkTheme.colors.onSurfaceVariant,
  },
  input: {
    borderWidth: 1,
    borderColor: LightTheme.colors.outline,
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    backgroundColor: LightTheme.colors.surface,
    color: LightTheme.colors.onSurface,
  },
  inputDark: {
    borderColor: DarkTheme.colors.outline,
    backgroundColor: DarkTheme.colors.surface,
    color: DarkTheme.colors.onSurface,
  },
  inputError: {
    borderColor: LightTheme.colors.error,
    backgroundColor: LightTheme.colors.errorContainer,
  },
  inputErrorDark: {
    borderColor: DarkTheme.colors.error,
    backgroundColor: DarkTheme.colors.errorContainer,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
