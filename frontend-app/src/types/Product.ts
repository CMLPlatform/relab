export type Product = {
  id: number | 'new';
  parentID?: number;
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  productType?: ProductType;
  componentIDs: number[];
  physicalProperties: PhysicalProperty[];
  images: { id: number; url: string; description: string }[];
  ownedBy: 'me' | string;
};

export type PhysicalProperty = {
  propertyName: string;
  value: number;
  unit: string;
};

export type ProductType = {
  id: number;
  name: string;
  description: string;
};
