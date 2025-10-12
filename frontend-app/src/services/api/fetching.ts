import { getUser } from '@/services/api/authentication';
import { Product } from '@/types/Product';

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;

// TODO: Build on generated API client from OpenAPI spec over manual schema mapping
type ProductData = {
  id: number;
  name: string;
  brand: string;
  model: string;
  description: string;
  created_at: string;
  updated_at: string;
  product_type: { name: string; description: string; id: number };
  physical_properties: { weight_kg: number; height_cm: number; width_cm: number; depth_cm: number };
  components: { id: number; name: string; description: string }[];
  images: ImageData[];
  owner_id: string;
};

type ImageData = {
  id: number;
  image_url: string;
  description: string;
};

async function toProduct(data: ProductData): Promise<Required<Product>> {
  const meId = await getUser().then((user) => user?.id);
  return {
    id: data.id,
    parentID: NaN,
    name: data.name,
    brand: data.brand,
    model: data.model,
    description: data.description,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    productType: data.product_type,
    ownedBy: data.owner_id === meId ? 'me' : data.owner_id,
    physicalProperties: [
      { propertyName: 'Weight', value: data.physical_properties.weight_kg, unit: 'kg' },
      { propertyName: 'Height', value: data.physical_properties.height_cm, unit: 'cm' },
      { propertyName: 'Width', value: data.physical_properties.width_cm, unit: 'cm' },
      { propertyName: 'Depth', value: data.physical_properties.depth_cm, unit: 'cm' },
    ],
    componentIDs: data.components.map(({ id }) => id),
    images: data.images.map((img) => ({ ...img, url: baseUrl + img.image_url })),
  };
}

export async function getProduct(id: number | 'new'): Promise<Product> {
  if (id === 'new') {
    return newProduct();
  }
  const url = new URL(baseUrl + `/products/${id}`);
  ['physical_properties', 'images', 'product_type', 'components'].forEach((inc) =>
    url.searchParams.append('include', inc),
  );

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  return toProduct(data as ProductData);
}

export function newProduct(name: string = '', parentID: number = NaN): Product {
  return {
    id: 'new',
    parentID: parentID,
    name: name,
    physicalProperties: [
      {
        propertyName: 'Weight',
        value: NaN,
        unit: 'kg',
      },
      {
        propertyName: 'Height',
        value: NaN,
        unit: 'cm',
      },
      {
        propertyName: 'Width',
        value: NaN,
        unit: 'cm',
      },
      {
        propertyName: 'Depth',
        value: NaN,
        unit: 'cm',
      },
    ],
    componentIDs: [],
    images: [],
    ownedBy: 'me',
  };
}

export async function allProducts(
  include = ['physical_properties', 'images', 'product_type', 'components'],
  page = 1,
  size = 50,
): Promise<Required<Product>[]> {
  const url = new URL(baseUrl + '/products');
  include.forEach((inc) => url.searchParams.append('include', inc));
  url.searchParams.append('page', page.toString());
  url.searchParams.append('size', size.toString());

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  const product_data = data.items as ProductData[];

  await getUser(); // Ensure user is loaded for ownership checks
  return Promise.all(product_data.map((data) => toProduct(data)));
}

export async function getBrands(): Promise<string[]> {
  const url = new URL(baseUrl + '/brands');
  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  return response.json() as Promise<string[]>;
}

export async function productComponents(product: Product): Promise<Product[]> {
  return Promise.all(product.componentIDs.map((id) => getProduct(id)));
}
