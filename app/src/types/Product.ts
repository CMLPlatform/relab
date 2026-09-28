import type { ApiMaterialUnit, ApiProductTypeRead } from './api';

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
  /** Edit version for optimistic concurrency; sent back in `If-Match` on update. */
  version?: number;
  /** Whether the last field edit was a moderator's rather than the owner's. */
  updatedByModerator?: boolean;
  productTypeID?: number;
  productTypeName?: string;
  /** The type as the API recorded it. Its id is the database's, which the bundled CPV snapshot does not share. */
  productType?: Pick<ApiProductTypeRead, 'id' | 'name' | 'description'>;
  componentIDs: number[];
  components?: Product[];
  ownerUsername?: string;
  physicalProperties: PhysicalProperties;
  circularityProperties: CircularityProperties;
  images?: {
    id?: string;
    url: string;
    thumbnailUrl?: string;
    /** The API's derivatives keyed by width in pixels. Sparse: a narrow original generates fewer. */
    thumbnailUrls?: Record<number, string>;
    /** Pixel size of the stored original, after rotation. Absent for images
     * uploaded before the API recorded it. Every entry in `thumbnailUrls`
     * shares this aspect ratio. */
    width?: number;
    height?: number;
    description: string;
  }[];
  thumbnailUrl?: string;
  thumbnailUrls?: Record<number, string>;
  videos?: { id?: number; url: string; description: string; title: string }[];
  ownedBy: 'me' | string;
  amountInParent?: number;
  /** Recorded bill of materials. Undefined where the payload omits it (list
   * rows and nested children), `[]` once loaded and empty. */
  materials?: ProductMaterial[];
};

/** One bill-of-materials observation: how much of a material, and where the material record came from. */
export type ProductMaterial = {
  materialID: number;
  name: string;
  quantity: number;
  unit: ApiMaterialUnit;
  /** URL, IRI or citation key for the material record. Absent when unrecorded. */
  source?: string;
};

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

/** Copy for the type row, labelled by role (only a component can be a material). */
export function typeRowLabels(role: Product['role']): { title: string; choose: string } {
  return role === 'component'
    ? { title: 'Component type or material', choose: 'Choose component type or material' }
    : { title: 'Product type', choose: 'Choose a product type' };
}
