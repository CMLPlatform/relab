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
  images: { id: number; url: string; description: string }[];
  ownedBy: 'me' | string;
};

export type PhysicalProperties = {
  weight: number;
  width: number;
  height: number;
  depth: number;
};
