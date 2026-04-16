import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { TextInput } from '@/components/base/TextInput';
import type {
  CircularityField,
  CircularityPropertyConfig,
} from '@/components/product/circularity/config';
import { getCircularityValues, hasContent } from '@/components/product/circularity/helpers';
import { styles } from '@/components/product/circularity/styles';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { CircularityProperties } from '@/types/Product';

type Props = {
  config: CircularityPropertyConfig;
  circularityProperties: CircularityProperties;
  editMode: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onUpdateField: (field: CircularityField, value: string) => void;
};

export function CircularityPropertySection({
  config,
  circularityProperties,
  editMode,
  isExpanded,
  onToggleExpanded,
  onRemove,
  onUpdateField,
}: Props) {
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
