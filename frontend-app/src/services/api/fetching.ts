import { getToken, getUser } from '@/services/api/authentication';
import { Product } from '@/types/Product';

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;

// TODO: Break up the fetching logic into smaller files
// TODO: Refactor the types to build on the generated API client from OpenAPI spec

type ProductData = {
  id: number;
  name: string;
  brand: string;
  model: string;
  description: string;
  created_at: string;
  updated_at: string;
  product_type_id: number;
  physical_properties: { weight_kg: number; height_cm: number; width_cm: number; depth_cm: number };
  components: { id: number; name: string; description: string }[];
  images: ImageData[];
  owner_id: string;
  parent_id?: number;
  amount_in_parent?: number;
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
    parentID: data.parent_id,
    name: data.name,
    brand: data.brand,
    model: data.model,
    description: data.description,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    productTypeID: data.product_type_id,
    ownedBy: data.owner_id === meId ? 'me' : data.owner_id,
    amountInParent: data.amount_in_parent,
    physicalProperties: {
      weight: data.physical_properties.weight_kg,
      height: data.physical_properties.height_cm,
      width: data.physical_properties.width_cm,
      depth: data.physical_properties.depth_cm,
    },
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

export function newProduct(
  name: string = '',
  parentID: number = NaN,
  brand: string | undefined = undefined,
  model: string | undefined = undefined,
): Product {
  return {
    id: 'new',
    parentID: parentID,
    name: name,
    brand: brand,
    model: model,
    physicalProperties: {
      weight: NaN,
      height: NaN,
      width: NaN,
      depth: NaN,
    },
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

export async function myProducts(
  include = ['physical_properties', 'images', 'product_type', 'components'],
  page = 1,
  size = 50,
): Promise<Required<Product>[]> {
  const url = new URL(baseUrl + '/users/me/products');
  include.forEach((inc) => url.searchParams.append('include', inc));
  url.searchParams.append('page', page.toString());
  url.searchParams.append('size', size.toString());

  const authToken = await getToken();
  if (!authToken) {
    throw new Error('Authentication required');
  }

  const headers = {
    Authorization: `Bearer ${authToken}`,
    Accept: 'application/json',
  };

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();

  // TODO: Update to data.items when adding pagination to /users/me/products endpoint
  const product_data = data as ProductData[];

  return Promise.all(product_data.map((data) => toProduct(data)));
}

export async function allBrands(): Promise<string[]> {
  const url = new URL(baseUrl + `/brands`);
  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  return data as string[];
}

export async function productComponents(product: Product): Promise<Product[]> {
  return Promise.all(product.componentIDs.map((id) => getProduct(id)));
}
