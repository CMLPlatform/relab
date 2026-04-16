import {
  type CircularityField,
  type CircularityFieldKey,
  type CircularityPropertyConfig,
  EMPTY_CIRCULARITY_PROPERTIES,
} from '@/components/product/circularity/config';
import type { CircularityProperties } from '@/types/Product';

export function getCircularityKey(
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

export function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

export function getCircularityValues(
  properties: CircularityProperties,
  config: CircularityPropertyConfig,
) {
  return {
    observation: properties[config.observationKey],
    comment: properties[config.commentKey],
    reference: properties[config.referenceKey],
  };
}

export function hasPropertyData(
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

export function updateCircularityField(
  properties: CircularityProperties,
  config: CircularityPropertyConfig,
  field: CircularityField,
  value: string,
): CircularityProperties {
  return {
    ...properties,
    [getCircularityKey(config, field)]: value,
  };
}

export function addCircularityProperty(
  properties: CircularityProperties | undefined,
  config: CircularityPropertyConfig,
): CircularityProperties {
  const next = { ...(properties ?? EMPTY_CIRCULARITY_PROPERTIES) };
  next[config.commentKey] = '';
  next[config.observationKey] = '';
  next[config.referenceKey] = '';
  return next;
}

export function removeCircularityProperty(
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

export function getHiddenSummary(count: number): string {
  if (count === 0) {
    return 'No associated circularity properties.';
  }

  return `${count} ${count === 1 ? 'property' : 'properties'} hidden.`;
}
