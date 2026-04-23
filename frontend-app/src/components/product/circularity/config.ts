import type { CircularityProperties } from '@/types/Product';

export type CircularityPropertyType = 'recyclability' | 'remanufacturability' | 'repairability';
export type CircularityField = 'comment' | 'observation' | 'reference';

export type CircularityFieldKey = keyof Pick<
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

export type CircularityPropertyConfig = {
  type: CircularityPropertyType;
  label: string;
  commentKey: CircularityFieldKey;
  observationKey: CircularityFieldKey;
  referenceKey: CircularityFieldKey;
};

export const PROPERTY_CONFIGS: readonly CircularityPropertyConfig[] = [
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

export const EMPTY_CIRCULARITY_PROPERTIES: CircularityProperties = {
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
