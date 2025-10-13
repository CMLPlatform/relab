import { getToken } from '@/services/api/authentication';
import { getProduct } from '@/services/api/fetching';
import { Product } from '@/types/Product';

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;
// TODO: Refactor this file to use generated API client from OpenAPI spec
// TODO: Break up into smaller files
function toNewProduct(product: Product): any {
  console.log('product type id', product.productType);
  return {
    name: product.name,
    brand: product.brand,
    model: product.model,
    description: product.description,
    product_type_id: product.productType?.id,
    // TODO: Implement bill of materials in the UI
    bill_of_materials: [
      {
        quantity: 42,
        unit: 'kg',
        material_id: 1,
      },
    ],
    physical_properties: toUpdatePhysicalProperties(product),
    amount_in_parent: product.parentID ? 1 : undefined,
  };
}

function toUpdateProduct(product: Product): any {
  return {
    name: product.name,
    brand: product.brand,
    model: product.model,
    description: product.description,
    product_type_id: product.productType?.id,
  };
}

function toUpdatePhysicalProperties(product: Product): any {
  return {
    weight_kg: product.physicalProperties.find((p) => p.propertyName === 'Weight')?.value || 0,
    height_cm: product.physicalProperties.find((p) => p.propertyName === 'Height')?.value || 0,
    width_cm: product.physicalProperties.find((p) => p.propertyName === 'Width')?.value || 0,
    depth_cm: product.physicalProperties.find((p) => p.propertyName === 'Depth')?.value || 0,
  };
}

export async function saveProduct(product: Product): Promise<number> {
  if (product.id === 'new') {
    return await saveNewProduct(product);
  } else {
    return await updateProduct(product);
  }
}

async function saveNewProduct(product: Product): Promise<number> {
  try {
    const url = product.parentID
      ? new URL(`${baseUrl}/products/${product.parentID}/components`)
      : new URL(baseUrl + '/products');

    const token = await getToken();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const body = JSON.stringify(toNewProduct(product));

    const response = await fetch(url, { method: 'POST', headers: headers, body: body });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create product: ${errorData.detail || response.statusText}`);
    }

    const data = await response.json();

    console.log('Created product:', data);
    product.id = data.id; // Update product ID to the newly assigned ID so we can add images

    await updateProductImages(product);

    return data.id;
  } catch (error: any) {
    console.error('[SaveNewProduct Error]:', error);
    throw new Error(error.message || 'Unable to create product. Please try again later.');
  }
}

async function updateProduct(product: Product): Promise<number> {
  try {
    const token = await getToken();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const productBody = JSON.stringify(toUpdateProduct(product));
    const propertiesBody = JSON.stringify(toUpdatePhysicalProperties(product));

    let url = new URL(baseUrl + `/products/${product.id}`);
    const response = await fetch(url, { method: 'PATCH', headers: headers, body: productBody });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to update product: ${errorData.detail || response.statusText}`);
    }

    url = new URL(baseUrl + `/products/${product.id}/physical_properties`);
    const propsResponse = await fetch(url, { method: 'PATCH', headers: headers, body: propertiesBody });

    if (!propsResponse.ok) {
      console.warn('[UpdateProduct] Failed to update physical properties');
    }

    await updateProductImages(product);

    const data = await response.json();

    return data.id;
  } catch (error: any) {
    console.error('[UpdateProduct Error]:', error);
    throw new Error(error.message || 'Unable to update product. Please try again later.');
  }
}

async function updateProductImages(product: Product) {
  try {
    const currentImages = await getProduct(product.id);
    const imagesToDelete = currentImages.images.filter((img) => !product.images.some((i) => i.id === img.id));
    const imagesToAdd = product.images.filter((img) => !img.id);

    for (const img of imagesToDelete) {
      await deleteImage(product, img);
    }

    for (const img of imagesToAdd) {
      await addImage(product, img);
    }
  } catch (error) {
    console.error('[UpdateProductImages Error]:', error);
    // Don't throw - image updates are not critical
  }
}

async function deleteImage(product: Product, image: { id: number }) {
  try {
    const url = new URL(baseUrl + `/products/${product.id}/images/${image.id}`);
    const token = await getToken();
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const response = await fetch(url, { method: 'DELETE', headers: headers });

    if (!response.ok) {
      console.warn(`[DeleteImage] Failed to delete image ${image.id}`);
    }
  } catch (error) {
    console.error('[DeleteImage Error]:', error);
    // Don't throw - continue with other images
  }
}

async function addImage(product: Product, image: { url: string; description: string }) {
  try {
    const url = new URL(baseUrl + `/products/${product.id}/images`);
    const token = await getToken();
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const body = new FormData();

    if (image.url.startsWith('data:')) {
      // Data URI (base64)
      body.append('file', dataURItoBlob(image.url), 'image.png');
    } else if (image.url.startsWith('file:')) {
      // Mobile file URI
      body.append('file', { uri: image.url, name: 'image.png', type: 'image/png' } as any);
    } else if (image.url.startsWith('blob:') || image.url.startsWith('http')) {
      // Web blob or URL - fetch and convert to blob
      const response = await fetch(image.url);
      const blob = await response.blob();
      body.append('file', blob, 'image.png');
    }

    console.log('[AddImage] Uploading image:', image.url);
    const response = await fetch(url, { method: 'POST', headers: headers, body: body });

    if (!response.ok) {
      console.warn('[AddImage] Failed to add image');
    }
  } catch (error) {
    console.error('[AddImage Error]:', error);
    // Don't throw - continue with other images
  }
}

function dataURItoBlob(dataURI: string) {
  const byteString = atob(dataURI.split(',')[1]); // decode base64
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]; // e.g. "image/png"

  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeString });
}

export async function deleteProduct(product: Product): Promise<void> {
  if (product.id === 'new') {
    return;
  } // New products are not saved yet

  try {
    const url = new URL(baseUrl + `/products/${product.id}`);
    const token = await getToken();
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const response = await fetch(url, { method: 'DELETE', headers: headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to delete product: ${errorData.detail || response.statusText}`);
    }
  } catch (error: any) {
    console.error('[DeleteProduct Error]:', error);
    throw new Error(error.message || 'Unable to delete product. Please try again later.');
  }
}

export function isProductValid(product: Product): boolean {
  const weightProp = product.physicalProperties.find((prop) => prop.propertyName === 'Weight');

  return (
    product.name !== undefined &&
    product.name !== '' &&
    // NOTE: Relaxed validation for now
    // product.brand != undefined &&
    // product.brand != '' &&
    // product.model != undefined &&
    // product.model != '' &&
    // product.description != undefined &&
    // product.description != '' &&
    // product.physicalProperties.every((prop) => !Number.isNaN(prop.value) && prop.value > 0)
    weightProp !== undefined &&
    !Number.isNaN(weightProp.value) &&
    weightProp.value > 0
  );
}
