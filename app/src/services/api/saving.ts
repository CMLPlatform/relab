import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import type { Product } from '@/types/Product';
import { throwFromResponse } from './errors';
import { resolveApiMediaUrl } from './media';

const baseUrl = API_URL;

// Flat URL scheme after the products/components split:
// - Base products live under /products/{id}
// - Components live under /components/{id}
// Parent path is used only as a creation scope:
//   POST /products/{id}/components for base-product parents
//   POST /components/{id}/components for component parents
// Product media stays under the same resource root: base-product media under
// /products/{id}, component media under /components/{id}.
function isComponent(product: Product): boolean {
  return product.role === 'component';
}

function productRootUrl(product: Product): URL {
  return isComponent(product)
    ? new URL(`${baseUrl}/components/${product.id}`)
    : new URL(`${baseUrl}/products/${product.id}`);
}

function productImagesUrl(product: Product): URL {
  return new URL(`${productRootUrl(product).toString()}/images`);
}

function productImageUrl(product: Product, imageId: string): URL {
  return new URL(`${productRootUrl(product).toString()}/images/${imageId}`);
}

function componentCreateUrl(product: Product): URL {
  if (typeof product.parentID !== 'number') {
    throw new Error('Cannot create a component without a parent.');
  }
  const parentRoot = product.parentRole === 'component' ? 'components' : 'products';
  return new URL(`${baseUrl}/${parentRoot}/${product.parentID}/components`);
}

// ─── API payload types (derived from generated OpenAPI types) ─────────────────

type ProductPayload = {
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  product_type_id: number | null;
  amount_in_parent?: number;
  weight_g: number | null;
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  circularity_properties: Product['circularityProperties'] | null;
};

// ─── Serialization helpers ────────────────────────────────────────────────────

function toNullableNumber(value: number | undefined): number | null {
  return value ?? null;
}

function toNullableText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() === '' ? null : value;
}

function toProductPayload(product: Product): ProductPayload {
  const component = isComponent(product);

  const circularityOut = {
    recyclability: toNullableText(product.circularityProperties.recyclability),
    disassemblability: toNullableText(product.circularityProperties.disassemblability),
    remanufacturability: toNullableText(product.circularityProperties.remanufacturability),
  };

  const hasCircularity = Object.values(circularityOut).some((v) => v !== null);

  return {
    name: product.name,
    brand: product.brand,
    model: product.model,
    description: product.description,
    product_type_id: product.productTypeID ? product.productTypeID : null,
    ...(component && { amount_in_parent: product.amountInParent ?? 1 }),
    weight_g: toNullableNumber(product.physicalProperties.weight),
    height_cm: toNullableNumber(product.physicalProperties.height),
    width_cm: toNullableNumber(product.physicalProperties.width),
    depth_cm: toNullableNumber(product.physicalProperties.depth),
    circularity_properties: hasCircularity ? circularityOut : null,
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };
const ACCEPT_HEADERS = { Accept: 'application/json' };

async function throwOnError(response: Response, label: string): Promise<void> {
  if (response.ok) return;
  await throwFromResponse(response, `Failed to ${label}`);
}

/**
 * The entity write landed but syncing its media did not. The record exists (and
 * differs from what any cache holds), so callers must still refresh — they just
 * can't claim the photos made it.
 */
export class MediaSyncError extends Error {
  readonly productId: number;

  constructor(productId: number, cause: unknown) {
    super('Saved, but some photos failed to upload.', { cause });
    this.name = 'MediaSyncError';
    this.productId = productId;
  }
}

/**
 * Save a product. For updates, pass the server-state images/videos so we can
 * diff without an extra network round-trip to re-fetch them.
 */
export async function saveProduct(
  product: Product,
  originalImages: Product['images'] = [],
  originalVideos: Product['videos'] = [],
): Promise<number> {
  if (typeof product.id !== 'number') {
    return await saveNewProduct(product);
  }
  return await updateProduct(product, originalImages, originalVideos);
}

async function saveNewProduct(product: Product): Promise<number> {
  // Creation scope: components are created under their parent (can be base or component);
  // base products are created flat under /products.
  const url = isComponent(product) ? componentCreateUrl(product) : new URL(`${baseUrl}/products`);

  const response = await fetchWithAuth(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(toProductPayload(product)),
  });
  await throwOnError(response, 'save product');

  const data = await response.json();
  product.id = data.id;

  // New product has no existing media on the server yet — uploads can run in parallel
  try {
    await Promise.all([updateProductImages(product, []), updateProductVideos(product, [])]);
  } catch (err) {
    throw new MediaSyncError(data.id, err);
  }

  return data.id;
}

async function updateProduct(
  product: Product,
  originalImages: Product['images'],
  originalVideos: Product['videos'],
): Promise<number> {
  // Single PATCH request — targets /products/{id} for base products, /components/{id} for components.
  const productRes = await fetchWithAuth(productRootUrl(product), {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(toProductPayload(product)),
  });

  await throwOnError(productRes, 'update product');

  const data = await productRes.json();

  // Image and video updates can run in parallel. The PATCH already landed, so a
  // failure here is partial: report it as such instead of as a failed save.
  try {
    await Promise.all([
      updateProductImages(product, originalImages),
      updateProductVideos(product, originalVideos),
    ]);
  } catch (err) {
    throw new MediaSyncError(data.id, err);
  }

  return data.id;
}

async function updateProductImages(product: Product, originalImages: Product['images']) {
  const currentImages = originalImages ?? [];
  const productImages = product.images ?? [];
  const imagesToDelete = currentImages.filter((img) => !productImages.some((i) => i.id === img.id));
  const imagesToAdd = productImages.filter((img) => !img.id);

  // Deletes can run in parallel
  await Promise.all(
    imagesToDelete
      .filter((img) => img.id !== undefined)
      .map((img) => deleteImage(product, img as { id: string })),
  );

  // Uploads run sequentially to avoid overwhelming the server with large payloads
  for (const img of imagesToAdd) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose — parallel large uploads overwhelm the server.
    await addImage(product, img);
  }
}

async function deleteImage(product: Product, image: { id: string }) {
  const response = await fetchWithAuth(productImageUrl(product, image.id), {
    method: 'DELETE',
    headers: ACCEPT_HEADERS,
  });
  // A 404 means the image is already gone server-side — treat as success so a
  // retried save (e.g. after a sibling upload failed) doesn't get stuck
  // re-issuing DELETE for an image the cache hasn't dropped yet.
  if (response.status === 404) return;
  await throwOnError(response, 'delete image');
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// The backend rejects an upload unless filename extension, declared MIME type,
// and sniffed content all agree, so the filename must reflect the real type.
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function imageFilename(mimeType: string): string {
  return `image.${IMAGE_EXTENSION_BY_MIME[mimeType] ?? 'jpg'}`;
}

async function addImage(
  product: Product,
  image: { url: string; description: string; id?: string },
) {
  const url = productImagesUrl(product);
  const body = new FormData();

  if (image.url.startsWith('data:')) {
    const fileBlob = dataURItoBlob(image.url);
    if (fileBlob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image is too large. Please use an image smaller than 10 MB.');
    }
    body.append('file', fileBlob, imageFilename(fileBlob.type));
  } else if (image.url.startsWith('file:')) {
    // No size check here: the file is never read into JS (React Native streams it
    // from disk) and no filesystem module is installed to stat it. The size guard
    // that matters runs at pick time, in processImage.
    // React Native extends FormData to accept { uri, name, type } for native file uploads.
    // Derive the MIME type from the picked file's extension so name and type agree.
    const extension = image.url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    const mimeType = IMAGE_MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
    body.append('file', {
      uri: image.url,
      name: imageFilename(mimeType),
      type: mimeType,
    } as unknown as Blob);
  } else if (image.url.startsWith('blob:') || image.url.startsWith('http')) {
    // Web blob or URL - fetch and convert to blob
    const response = await fetch(image.url);
    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image is too large. Please use an image smaller than 10 MB.');
    }
    body.append('file', blob, imageFilename(blob.type));
  }

  const response = await fetchWithAuth(url, {
    method: 'POST',
    headers: ACCEPT_HEADERS,
    body: body,
    timeoutMs: 30_000,
  });
  await throwOnError(response, 'upload image');

  // If the server returned the stored media object, update the local image
  // entry so the UI uses the persisted HTTP URL instead of a blob: URI.
  const data = await response.json().catch(() => null);
  if (data?.id) {
    // mutate the object in-place so callers see the updated id/url
    image.id = data.id;
  }
  if (data?.image_url) {
    // Resolve the server's (relative) media path to an absolute origin URL, the
    // same way the product mappers do — a bare path renders blank on native.
    image.url = resolveApiMediaUrl(data.image_url) ?? data.image_url;
  }
}

function dataURItoBlob(dataURI: string) {
  let byteString: string;
  try {
    byteString = atob(dataURI.split(',')[1]); // decode base64
  } catch {
    throw new Error('Invalid image data.');
  }
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]; // e.g. "image/png"

  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeString });
}

async function updateProductVideos(product: Product, originalVideos: Product['videos']) {
  // Videos live only on base products (disassembly captures whole products).
  if (isComponent(product)) return;

  const currentVideos = originalVideos || [];
  const productVideos = product.videos ?? [];
  const videosToDelete = currentVideos.filter((vid) => !productVideos.some((v) => v.id === vid.id));
  const videosToAdd = productVideos.filter((vid) => !vid.id);
  const videosToUpdate = productVideos.filter((vid) => {
    const orig = currentVideos.find((v) => v.id === vid.id);
    return (
      orig &&
      (orig.url !== vid.url || orig.description !== vid.description || orig.title !== vid.title)
    );
  });

  const videoUrl = (vid: { id?: number }) =>
    new URL(`${baseUrl}/products/${product.id}/videos/${vid.id}`);

  // Deletes and updates can run in parallel
  await Promise.all([
    ...videosToDelete
      .filter((vid) => vid.id)
      .map(async (vid) => {
        const response = await fetchWithAuth(videoUrl(vid), {
          method: 'DELETE',
          headers: ACCEPT_HEADERS,
        });
        await throwOnError(response, 'delete video');
      }),
    ...videosToUpdate
      .filter((vid) => vid.id)
      .map(async (vid) => {
        const response = await fetchWithAuth(videoUrl(vid), {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ url: vid.url, description: vid.description, title: vid.title }),
        });
        await throwOnError(response, 'update video');
      }),
  ]);

  // Adds run sequentially
  for (const vid of videosToAdd) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose — mirrors image uploads.
    const response = await fetchWithAuth(new URL(`${baseUrl}/products/${product.id}/videos`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url: vid.url, description: vid.description, title: vid.title }),
    });
    await throwOnError(response, 'add video');
  }
}

export async function deleteProduct(product: Product): Promise<void> {
  if (typeof product.id !== 'number') return; // Unsaved drafts: nothing to delete.
  const response = await fetchWithAuth(productRootUrl(product), {
    method: 'DELETE',
    headers: ACCEPT_HEADERS,
  });
  await throwOnError(response, 'delete product');
}
