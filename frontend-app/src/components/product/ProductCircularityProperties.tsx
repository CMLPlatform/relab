import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/base/Chip';
import { Text } from '@/components/base/Text';
import { TextInput } from '@/components/base/TextInput';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { radius, spacing } from '@/constants/layout';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { CircularityProperties, Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onChangeCircularityProperties?: (newProperties: CircularityProperties) => void;
}

type CircularityPropertyType = 'recyclability' | 'remanufacturability' | 'repairability';
type CircularityField = 'comment' | 'observation' | 'reference';

type CircularityFieldKey = keyof Pick<
  CircularityProperties,
  | 'recyclabilityComment'
  | 'recyclabilityObservation'
  | 'recyclabilityReference'
  | 'remanufacturabilityComment'
  | 'remanufacturabilityObservation'
  | 'remanufacturabilityReference'
  | 'repairabilityComment'
  | 'repairabilityObservation'
  | 'repairabilityReference'
>;

type CircularityPropertyConfig = {
  type: CircularityPropertyType;
  label: string;
  commentKey: CircularityFieldKey;
  observationKey: CircularityFieldKey;
  referenceKey: CircularityFieldKey;
};

type CircularityPropertySectionProps = {
  config: CircularityPropertyConfig;
  circularityProperties: CircularityProperties;
  editMode: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onUpdateField: (field: CircularityField, value: string) => void;
};

const PROPERTY_CONFIGS: readonly CircularityPropertyConfig[] = [
  {
    type: 'recyclability',
    label: 'Recyclability',
    commentKey: 'recyclabilityComment',
    observationKey: 'recyclabilityObservation',
    referenceKey: 'recyclabilityReference',
  },
  {
    type: 'remanufacturability',
    label: 'Remanufacturability',
    commentKey: 'remanufacturabilityComment',
    observationKey: 'remanufacturabilityObservation',
    referenceKey: 'remanufacturabilityReference',
  },
  {
    type: 'repairability',
    label: 'Repairability',
    commentKey: 'repairabilityComment',
    observationKey: 'repairabilityObservation',
    referenceKey: 'repairabilityReference',
  },
] as const;

const EMPTY_CIRCULARITY_PROPERTIES: CircularityProperties = {
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

function getCircularityKeys(
  config: CircularityPropertyConfig,
  field: CircularityField,
): CircularityFieldKey {
  switch (field) {
    case 'comment':
      return config.commentKey;
    case 'observation':
      return config.observationKey;
    case 'reference':
      return config.referenceKey;
  }
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function getCircularityValues(
  properties: CircularityProperties,
  config: CircularityPropertyConfig,
) {
  return {
    observation: properties[config.observationKey],
    comment: properties[config.commentKey],
    reference: properties[config.referenceKey],
  };
}

function hasPropertyData(
  properties: CircularityProperties | undefined,
  config: CircularityPropertyConfig,
): boolean {
  if (!properties) return false;

  const { observation, comment, reference } = getCircularityValues(properties, config);
  return (
    hasContent(observation) ||
    hasContent(comment) ||
    hasContent(reference) ||
    comment !== null ||
    reference !== null
  );
}

function updateCircularityField(
  properties: CircularityProperties,
  config: CircularityPropertyConfig,
  field: CircularityField,
  value: string,
): CircularityProperties {
  return {
    ...properties,
    [getCircularityKeys(config, field)]: value,
  };
}

function addCircularityProperty(
  properties: CircularityProperties | undefined,
  config: CircularityPropertyConfig,
): CircularityProperties {
  const next = { ...(properties ?? EMPTY_CIRCULARITY_PROPERTIES) };
  next[config.commentKey] = '';
  next[config.observationKey] = '';
  next[config.referenceKey] = '';
  return next;
}

function removeCircularityProperty(
  properties: CircularityProperties,
  config: CircularityPropertyConfig,
): CircularityProperties {
  return {
    ...properties,
    [config.commentKey]: null,
    [config.observationKey]: '',
    [config.referenceKey]: null,
  };
}

function getHiddenSummary(count: number): string {
  if (count === 0) {
    return 'No associated circularity properties.';
  }

  return `${count} ${count === 1 ? 'property' : 'properties'} hidden.`;
}

export default function ProductCircularityProperties({
  product,
  editMode,
  onChangeCircularityProperties,
}: Props) {
  const { colors } = useAppTheme();
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);
  const [expandedProperty, setExpandedProperty] = useState<CircularityPropertyType | null>(null);

  const chipsToShow = editMode
    ? PROPERTY_CONFIGS.filter((config) => !hasPropertyData(product.circularityProperties, config))
    : [];
  const visibleProperties = PROPERTY_CONFIGS.filter((config) =>
    hasPropertyData(product.circularityProperties, config),
  );

  const updateField = (
    config: CircularityPropertyConfig,
    field: CircularityField,
    value: string,
  ) => {
    if (!product.circularityProperties) return;
    onChangeCircularityProperties?.(
      updateCircularityField(product.circularityProperties, config, field, value),
    );
  };

  const addProperty = (config: CircularityPropertyConfig) => {
    onChangeCircularityProperties?.(addCircularityProperty(product.circularityProperties, config));
    setExpandedProperty(config.type);
  };

  const removeProperty = (config: CircularityPropertyConfig) => {
    if (!product.circularityProperties) return;
    onChangeCircularityProperties?.(
      removeCircularityProperty(product.circularityProperties, config),
    );
    setExpandedProperty(null);
  };

  const toggleSectionLabel = isSectionExpanded ? 'Hide' : 'Show';

  return (
    <View>
      <DetailSectionHeader
        title="Circularity Properties"
        tooltipTitle="Add recyclability, remanufacturability, and repairability information. Observation fields are required."
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
        <Text style={styles.sectionSummary}>{getHiddenSummary(visibleProperties.length)}</Text>
      ) : (
        <>
          {visibleProperties.length === 0 && !editMode ? (
            <Text style={styles.sectionSummary}>No associated circularity properties.</Text>
          ) : null}

          {chipsToShow.length > 0 ? (
            <View style={styles.chipContainer}>
              {chipsToShow.map((config) => (
                <Chip
                  key={config.type}
                  onPress={() => addProperty(config)}
                  icon={<MaterialCommunityIcons name="plus" size={16} color={colors.onPrimary} />}
                >
                  {config.label}
                </Chip>
              ))}
            </View>
          ) : null}

          {visibleProperties.map((config) =>
            product.circularityProperties ? (
              <CircularityPropertySection
                key={config.type}
                config={config}
                circularityProperties={product.circularityProperties}
                editMode={editMode}
                isExpanded={expandedProperty === config.type}
                onToggleExpanded={() =>
                  setExpandedProperty((current) => (current === config.type ? null : config.type))
                }
                onRemove={() => removeProperty(config)}
                onUpdateField={(field, value) => updateField(config, field, value)}
              />
            ) : null,
          )}
        </>
      )}
    </View>
  );
}

function CircularityPropertySection({
  config,
  circularityProperties,
  editMode,
  isExpanded,
  onToggleExpanded,
  onRemove,
  onUpdateField,
}: CircularityPropertySectionProps) {
  const { colors } = useAppTheme();
  const { observation, comment, reference } = getCircularityValues(circularityProperties, config);

  return (
    <Fragment>
      <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
      <View style={styles.propertySection}>
        <View style={styles.propertyHeader}>
          <Text style={styles.propertyTitle}>{config.label}</Text>
          <View style={styles.propertyActions}>
            <Pressable
              onPress={onToggleExpanded}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded ? `Collapse ${config.label}` : `Expand ${config.label}`
              }
            >
              <MaterialCommunityIcons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={colors.onSurface}
              />
            </Pressable>
            {editMode ? (
              <Pressable
                onPress={onRemove}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${config.label}`}
              >
                <MaterialCommunityIcons name="delete" size={24} color={colors.onSurface} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {isExpanded ? (
          <View style={styles.propertyFields}>
            {editMode || hasContent(observation) ? (
              <CircularityFieldInput
                label="Observation (Required)"
                value={String(observation || '')}
                editable={editMode}
                multiline
                numberOfLines={3}
                onChangeText={(text) => onUpdateField('observation', text)}
                colors={colors}
                isRequiredError={editMode && !observation}
              />
            ) : null}

            {editMode || hasContent(comment) ? (
              <CircularityFieldInput
                label="Comment (Optional)"
                value={String(comment || '')}
                editable={editMode}
                multiline
                numberOfLines={2}
                onChangeText={(text) => onUpdateField('comment', text)}
                colors={colors}
              />
            ) : null}

            {editMode || hasContent(reference) ? (
              <CircularityFieldInput
                label="Reference (Optional)"
                value={String(reference || '')}
                editable={editMode}
                onChangeText={(text) => onUpdateField('reference', text)}
                colors={colors}
                placeholder="e.g., ISO 14021:2016"
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Fragment>
  );
}

function CircularityFieldInput({
  label,
  value,
  editable,
  onChangeText,
  colors,
  multiline = false,
  numberOfLines,
  placeholder,
  isRequiredError = false,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChangeText: (text: string) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  multiline?: boolean;
  numberOfLines?: number;
  placeholder?: string;
  isRequiredError?: boolean;
}) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          {
            borderColor: colors.outline,
            backgroundColor: colors.surface,
            color: colors.onSurface,
          },
          isRequiredError
            ? {
                borderColor: colors.error,
                backgroundColor: colors.errorContainer,
              }
            : null,
        ]}
        errorOnEmpty={isRequiredError}
        placeholder={placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionSummary: {
    opacity: 0.7,
    marginBottom: 8,
  },
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
