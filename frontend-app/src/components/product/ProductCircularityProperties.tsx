import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Chip, Text, TextInput } from '@/components/base';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { spacing, radius } from '@/constants/layout';
import { CircularityProperties, Product } from '@/types/Product';

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
  const { colors } = useAppTheme();
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);
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
  const propertyCount = expandedPropertiesToShow.length;

  if (!isSectionExpanded) {
    return (
      <View>
        <DetailSectionHeader
          title="Circularity Properties"
          tooltipTitle="Add recyclability, remanufacturability, and repairability information. Observation fields are required."
          rightElement={
            <Pressable
              onPress={() => setIsSectionExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Show circularity properties"
            >
              <Text style={{ fontWeight: '600', color: colors.primary }}>Show</Text>
            </Pressable>
          }
        />
        <Text style={{ opacity: 0.7, marginBottom: 8 }}>
          {propertyCount === 0
            ? 'No associated circularity properties.'
            : `${propertyCount} ${propertyCount === 1 ? 'property' : 'properties'} hidden.`}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <DetailSectionHeader
        title="Circularity Properties"
        tooltipTitle="Add recyclability, remanufacturability, and repairability information. Observation fields are required."
        rightElement={
          <Pressable
            onPress={() => setIsSectionExpanded(false)}
            accessibilityRole="button"
            accessibilityLabel="Hide circularity properties"
          >
            <Text style={{ fontWeight: '600', color: colors.primary }}>Hide</Text>
          </Pressable>
        }
      />

      {/* Show message when no properties exist */}
      {expandedPropertiesToShow.length === 0 && !editMode && (
        <Text style={{ opacity: 0.7, marginBottom: 8 }}>No associated circularity properties.</Text>
      )}

      {/* Render chips in a single horizontal container */}
      {chipsToShow.length > 0 && (
        <View style={styles.chipContainer}>
          {chipsToShow.map((type) => (
            <Chip
              key={type}
              onPress={() => addProperty(type)}
              icon={<MaterialCommunityIcons name="plus" size={16} color={colors.onPrimary} />}
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
  const { colors } = useAppTheme();

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
      <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
      <View style={styles.propertySection}>
        <View style={styles.propertyHeader}>
          <Text style={styles.propertyTitle}>{propertyLabels[type]}</Text>
          <View style={styles.propertyActions}>
            <Pressable
              onPress={onToggleExpanded}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? `Collapse ${propertyLabels[type]}` : `Expand ${propertyLabels[type]}`}
            >
              <MaterialCommunityIcons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={colors.onSurface}
              />
            </Pressable>
            {editMode && (
              <Pressable
                onPress={onRemove}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${propertyLabels[type]}`}
              >
                <MaterialCommunityIcons name="delete" size={24} color={colors.onSurface} />
              </Pressable>
            )}
          </View>
        </View>

        {isExpanded && (
          <View style={styles.propertyFields}>
            {/* Observation field - always show in edit mode, only show if has content in view mode */}
            {(editMode || hasContent(observation)) && (
              <View>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Observation (Required)</Text>
                <TextInput
                  value={String(observation || '')}
                  onChangeText={(text) => onUpdateField('observation', text)}
                  multiline
                  numberOfLines={3}
                  editable={editMode}
                  style={[
                    styles.input,
                    styles.multilineInput,
                    {
                      borderColor: colors.outline,
                      backgroundColor: colors.surface,
                      color: colors.onSurface,
                    },
                    editMode &&
                      !observation && {
                        borderColor: colors.error,
                        backgroundColor: colors.errorContainer,
                      },
                  ]}
                  errorOnEmpty={editMode && !observation}
                />
              </View>
            )}

            {/* Comment field - always show in edit mode, only show if has content in view mode */}
            {(editMode || hasContent(comment)) && (
              <View>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Comment (Optional)</Text>
                <TextInput
                  value={String(comment || '')}
                  onChangeText={(text) => onUpdateField('comment', text)}
                  multiline
                  numberOfLines={2}
                  editable={editMode}
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
              </View>
            )}

            {/* Reference field - always show in edit mode, only show if has content in view mode */}
            {(editMode || hasContent(reference)) && (
              <View>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Reference (Optional)</Text>
                <TextInput
                  value={String(reference || '')}
                  onChangeText={(text) => onUpdateField('reference', text)}
                  editable={editMode}
                  style={[
                    styles.input,
                    {
                      borderColor: colors.outline,
                      backgroundColor: colors.surface,
                      color: colors.onSurface,
                    },
                  ]}
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
  chipContainer: {
    paddingVertical: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  divider: {
    height: 1,
  },
  propertySection: {
    paddingVertical: 14,
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
    gap: spacing.xs,
  },
  iconButton: {
    padding: spacing.sm,
    borderRadius: 20,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  propertyFields: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
