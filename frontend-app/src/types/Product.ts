export type Product = {
  /** Undefined for unsaved drafts. Populated once the backend assigns an id on save. */
  id?: number;
  role: 'product' | 'component';
  parentID?: number;
  parentRole?: 'product' | 'component';
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  productTypeID?: number;
  productTypeName?: string;
  componentIDs: number[];
  components: Product[];
  ownerUsername?: string;
  physicalProperties: PhysicalProperties;
  circularityProperties: CircularityProperties;
  images: { id?: string; url: string; thumbnailUrl?: string; description: string }[];
  thumbnailUrl?: string;
  videos: { id?: number; url: string; description: string; title: string }[];
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

export function entityLabel(product: Pick<Product, 'role'>): 'product' | 'component' {
  return product.role === 'component' ? 'component' : 'product';
}

export function entityLabelTitle(product: Pick<Product, 'role'>): 'Product' | 'Component' {
  return product.role === 'component' ? 'Component' : 'Product';
}
