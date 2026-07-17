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
  components?: Product[];
  ownerUsername?: string;
  physicalProperties: PhysicalProperties;
  circularityProperties: CircularityProperties;
  images?: { id?: string; url: string; thumbnailUrl?: string; description: string }[];
  thumbnailUrl?: string;
  videos?: { id?: number; url: string; description: string; title: string }[];
  ownedBy: 'me' | string;
  amountInParent?: number;
};

// `undefined` is the unset sentinel — a measurement the user hasn't given. The
// keys stay required (not `weight?:`) because ProductPhysicalProperties renders
// one row per Object.keys() entry, so an omitted key would silently drop a row.
export type PhysicalProperties = {
  weight: number | undefined;
  width: number | undefined;
  height: number | undefined;
  depth: number | undefined;
};

export type CircularityProperties = {
  recyclability?: string | null;
  disassemblability?: string | null;
  remanufacturability?: string | null;
};

export function entityLabel(product: Pick<Product, 'role'>): 'product' | 'component' {
  return product.role;
}

export function entityLabelTitle(product: Pick<Product, 'role'>): 'Product' | 'Component' {
  return product.role === 'component' ? 'Component' : 'Product';
}

/**
 * Copy for the type row, which is labelled by role because only a component can
 * be a material. Shared by the capture and detail screens so the same record
 * can't change wording between them.
 */
export function typeRowLabels(role: Product['role']): { title: string; choose: string } {
  return role === 'component'
    ? { title: 'Component type or material', choose: 'Choose component type or material' }
    : { title: 'Product type', choose: 'Choose a product type' };
}
