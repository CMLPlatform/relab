import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Chip } from '@/components/base/Chip';
import { Text } from '@/components/base/Text';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { CircularityPropertySection } from '@/components/product/circularity/CircularityPropertySection';
import {
  type CircularityField,
  type CircularityPropertyConfig,
  type CircularityPropertyType,
  PROPERTY_CONFIGS,
} from '@/components/product/circularity/config';
import {
  addCircularityProperty,
  getHiddenSummary,
  hasPropertyData,
  removeCircularityProperty,
  updateCircularityField,
} from '@/components/product/circularity/helpers';
import { styles } from '@/components/product/circularity/styles';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { CircularityProperties, Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onChangeCircularityProperties?: (newProperties: CircularityProperties) => void;
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
