export type Product = {
  id: number | 'new';
  parentID?: number;
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  productTypeID?: number;
  componentIDs: number[];
  physicalProperties: PhysicalProperties;
  circularityProperties: CircularityProperties;
  images: { id: number; url: string; description: string }[];
  ownedBy: 'me' | string;
  amountInParent?: number;
};

export type PhysicalProperties = {
  weight: number;
  width: number;
  height: number;
  depth: number;
};

export type CircularityProperties = {
  recyclabilityComment?: string | null;
  recyclabilityObservation: string;
  recyclabilityReference?: string | null;
  remanufacturabilityComment?: string | null;
  remanufacturabilityObservation: string;
  remanufacturabilityReference?: string | null;
  repairabilityComment?: string | null;
  repairabilityObservation: string;
  repairabilityReference?: string | null;
};

