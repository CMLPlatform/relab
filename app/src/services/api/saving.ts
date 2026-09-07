import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import type { Product } from '@/types/Product';
import { throwFromResponse } from './errors';
import { resolveApiMediaUrl } from './media';

const baseUrl = API_URL;

// Base products live under /products/{id}, components under /components/{id},
// media under the same root. The parent path is only a creation scope:
// POST /{products|components}/{parentId}/components.
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

// ─── API payload types ────────────────────────────────────────────────────────

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

/** The entity write landed but its media sync did not; callers must still refresh caches. */
export class MediaSyncError extends Error {
  readonly productId: number;

  constructor(productId: number, cause: unknown) {
    super('Saved, but some photos failed to upload.', { cause });
    this.name = 'MediaSyncError';
    this.productId = productId;
  }
}

/** Save a product. For updates, pass the server-state images/videos to diff against. */
export async function saveProduct(
  product: Product,
  originalImages: Product['images'] = [],
  originalVideos: Product['videos'] = [],
  // Creates only; PATCH updates are idempotent.
  idempotencyKey?: string,
): Promise<number> {
  if (typeof product.id !== 'number') {
    return await saveNewProduct(product, idempotencyKey);
  }
  return await updateProduct(product, originalImages, originalVideos);
}

async function saveNewProduct(product: Product, idempotencyKey?: string): Promise<number> {
  const url = isComponent(product) ? componentCreateUrl(product) : new URL(`${baseUrl}/products`);

  const response = await fetchWithAuth(url, {
    method: 'POST',
    headers: idempotencyKey ? { ...JSON_HEADERS, 'Idempotency-Key': idempotencyKey } : JSON_HEADERS,
    body: JSON.stringify(toProductPayload(product)),
  });
  await throwOnError(response, 'save product');

  const data = await response.json();
  product.id = data.id;

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
  const productRes = await fetchWithAuth(productRootUrl(product), {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(toProductPayload(product)),
  });

  await throwOnError(productRes, 'update product');

  const data = await productRes.json();

  // The PATCH already landed, so a media failure is partial, not a failed save.
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

  await Promise.all(
    imagesToDelete
      .filter((img) => img.id !== undefined)
      .map((img) => deleteImage(product, img as { id: string })),
  );

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
  // Already gone server-side: a retried save must not get stuck on it.
  if (response.status === 404) return;
  await throwOnError(response, 'delete image');
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// The backend requires filename extension, declared MIME type, and sniffed
// content to agree.
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
    // No size check: RN streams the file from disk and nothing here can stat
    // it. processImage guards size at pick time.
    // RN FormData accepts { uri, name, type } for native file uploads.
    const extension = image.url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    const mimeType = IMAGE_MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
    body.append('file', {
      uri: image.url,
      name: imageFilename(mimeType),
      type: mimeType,
    } as unknown as Blob);
  } else if (image.url.startsWith('blob:') || image.url.startsWith('http')) {
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

  // Mutate the image in place so callers see the persisted id/url.
  const data = await response.json().catch(() => null);
  if (data?.id) {
    image.id = data.id;
  }
  if (data?.image_url) {
    // A bare relative path renders blank on native.
    image.url = resolveApiMediaUrl(data.image_url) ?? data.image_url;
  }
}

function dataURItoBlob(dataURI: string) {
  let byteString: string;
  try {
    byteString = atob(dataURI.split(',')[1]);
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
  // Videos live only on base products.
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
  if (typeof product.id !== 'number') return;
  const response = await fetchWithAuth(productRootUrl(product), {
    method: 'DELETE',
    headers: ACCEPT_HEADERS,
  });
  await throwOnError(response, 'delete product');
}
