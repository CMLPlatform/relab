import { API_URL } from '@/config';
import { getToken } from '@/services/api/authentication';
import { apiFetch } from '@/services/api/client';
import type { Product } from '@/types/Product';

const baseUrl = API_URL;

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
  recyclability_comment?: string | null;
  recyclability_observation?: string | null;
  recyclability_reference?: string | null;
  remanufacturability_comment?: string | null;
  remanufacturability_observation?: string | null;
  remanufacturability_reference?: string | null;
  repairability_comment?: string | null;
  repairability_observation?: string | null;
  repairability_reference?: string | null;
};

type NewProductPayload = ProductPayload & {
  videos: Product['videos'];
};

// ─── Serialization helpers ────────────────────────────────────────────────────

function toNullableNumber(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value)) return null;
  return value;
}

function toNullableText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() === '' ? null : value;
}

function toProductPayload(product: Product): ProductPayload {
  const isComponent = typeof product.parentID === 'number' && !Number.isNaN(product.parentID);

  const circularityOut = {
    recyclability_comment: toNullableText(product.circularityProperties.recyclabilityComment),
    recyclability_observation: toNullableText(
      product.circularityProperties.recyclabilityObservation,
    ),
    recyclability_reference: toNullableText(product.circularityProperties.recyclabilityReference),
    remanufacturability_comment: toNullableText(
      product.circularityProperties.remanufacturabilityComment,
    ),
    remanufacturability_observation: toNullableText(
      product.circularityProperties.remanufacturabilityObservation,
    ),
    remanufacturability_reference: toNullableText(
      product.circularityProperties.remanufacturabilityReference,
    ),
    repairability_comment: toNullableText(product.circularityProperties.repairabilityComment),
    repairability_observation: toNullableText(
      product.circularityProperties.repairabilityObservation,
    ),
    repairability_reference: toNullableText(product.circularityProperties.repairabilityReference),
  };

  const hasCircularity = Object.values(circularityOut).some((v) => v !== null);

  return {
    name: product.name,
    brand: product.brand,
    model: product.model,
    description: product.description,
    product_type_id: product.productTypeID ? product.productTypeID : null,
    ...(isComponent && { amount_in_parent: product.amountInParent ?? 1 }),
    weight_g: toNullableNumber(product.physicalProperties.weight),
    height_cm: toNullableNumber(product.physicalProperties.height),
    width_cm: toNullableNumber(product.physicalProperties.width),
    depth_cm: toNullableNumber(product.physicalProperties.depth),
    ...(hasCircularity ? circularityOut : {}),
  };
}

function toNewProductPayload(product: Product): NewProductPayload {
  return {
    ...toProductPayload(product),
    videos: product.videos,
  };
}

function authHeaders(token: string | undefined): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function throwOnError(response: Response, label: string): Promise<void> {
  if (response.ok || response.status === 404) return;
  const errData = await response.json().catch(() => null);
  throw new Error(
    `Failed to ${label}: ${errData?.detail?.[0]?.msg || errData?.detail || response.statusText}`,
  );
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
  const token = await getToken();

  if (product.id === 'new') {
    return await saveNewProduct(product, token);
  } else {
    return await updateProduct(product, originalImages, originalVideos, token);
  }
}

async function saveNewProduct(product: Product, token: string | undefined): Promise<number> {
  const url =
    typeof product.parentID === 'number' && !Number.isNaN(product.parentID)
      ? new URL(`${baseUrl}/products/${product.parentID}/components`)
      : new URL(`${baseUrl}/products`);

  const headers = authHeaders(token);
  const response = await apiFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(toNewProductPayload(product)),
  });
  await throwOnError(response, 'save product');

  const data = await response.json();
  product.id = data.id;

  // New product has no existing media on the server yet — uploads can run in parallel
  await Promise.all([
    updateProductImages(product, [], token),
    updateProductVideos(product, [], token),
  ]);

  return data.id;
}

async function updateProduct(
  product: Product,
  originalImages: Product['images'],
  originalVideos: Product['videos'],
  token: string | undefined,
): Promise<number> {
  const headers = authHeaders(token);

  // Single PATCH request — properties are now flat on the product
  const productRes = await apiFetch(new URL(`${baseUrl}/products/${product.id}`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(toProductPayload(product)),
  });

  await throwOnError(productRes, 'update product');

  // Image and video updates can run in parallel
  await Promise.all([
    updateProductImages(product, originalImages, token),
    updateProductVideos(product, originalVideos, token),
  ]);

  const data = await productRes.json();
  return data.id;
}

async function updateProductImages(
  product: Product,
  originalImages: Product['images'],
  token: string | undefined,
) {
  const imagesToDelete = originalImages.filter(
    (img) => !product.images.some((i) => i.id === img.id),
  );
  const imagesToAdd = product.images.filter((img) => !img.id);

  // Deletes can run in parallel
  await Promise.all(
    imagesToDelete
      .filter((img) => img.id !== undefined)
      .map((img) => deleteImage(product, img as { id: string }, token)),
  );

  // Uploads run sequentially to avoid overwhelming the server with large payloads
  for (const img of imagesToAdd) {
    await addImage(product, img, token);
  }
}

async function deleteImage(product: Product, image: { id: string }, token: string | undefined) {
  const url = new URL(`${baseUrl}/products/${product.id}/images/${image.id}`);
  return await apiFetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

async function addImage(
  product: Product,
  image: { url: string; description: string; id?: string },
  token: string | undefined,
) {
  const url = new URL(`${baseUrl}/products/${product.id}/images`);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const body = new FormData();

  if (image.url.startsWith('data:')) {
    const fileBlob = dataURItoBlob(image.url);
    if (fileBlob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image is too large. Please use an image smaller than 10 MB.');
    }
    body.append('file', fileBlob, 'image.png');
  } else if (image.url.startsWith('file:')) {
    // React Native extends FormData to accept { uri, name, type } for native file uploads
    body.append('file', {
      uri: image.url,
      name: 'image.png',
      type: 'image/png',
    } as unknown as Blob);
  } else if (image.url.startsWith('blob:') || image.url.startsWith('http')) {
    // Web blob or URL - fetch and convert to blob
    const response = await fetch(image.url);
    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image is too large. Please use an image smaller than 10 MB.');
    }
    body.append('file', blob, 'image.png');
  }

  const response = await apiFetch(url, {
    method: 'POST',
    headers: headers,
    body: body,
    timeoutMs: 30_000,
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new Error(`Image upload failed: ${errData?.detail || response.statusText}`);
  }

  // If the server returned the stored media object, update the local image
  // entry so the UI uses the persisted HTTP URL instead of a blob: URI.
  const data = await response.json().catch(() => null);
  if (data) {
    try {
      if (data.id) {
        // mutate the object in-place so callers see the updated id/url
        image.id = data.id;
      }
      const newUrl = data.url || data.image_url || data.file_url || data.path || data.location;
      if (newUrl) {
        image.url = newUrl;
      }
    } catch {
      // ignore mutation errors
    }
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

async function updateProductVideos(
  product: Product,
  originalVideos: Product['videos'],
  token: string | undefined,
) {
  const currentVideos = originalVideos || [];
  const videosToDelete = currentVideos.filter(
    (vid) => !product.videos.some((v) => v.id === vid.id),
  );
  const videosToAdd = product.videos.filter((vid) => !vid.id);
  const videosToUpdate = product.videos.filter((vid) => {
    const orig = currentVideos.find((v) => v.id === vid.id);
    return (
      orig &&
      (orig.url !== vid.url || orig.description !== vid.description || orig.title !== vid.title)
    );
  });

  const headers = authHeaders(token);

  // Deletes and updates can run in parallel
  await Promise.all([
    ...videosToDelete
      .filter((vid) => vid.id)
      .map((vid) =>
        apiFetch(new URL(`${baseUrl}/products/${product.id}/videos/${vid.id}`), {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }),
      ),
    ...videosToUpdate
      .filter((vid) => vid.id)
      .map((vid) =>
        apiFetch(new URL(`${baseUrl}/products/${product.id}/videos/${vid.id}`), {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ url: vid.url, description: vid.description, title: vid.title }),
        }),
      ),
  ]);

  // Adds run sequentially
  for (const vid of videosToAdd) {
    await apiFetch(new URL(`${baseUrl}/products/${product.id}/videos`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: vid.url, description: vid.description, title: vid.title }),
    });
  }
}

export async function deleteProduct(product: Product): Promise<void> {
  if (product.id === 'new') {
    return;
  } // New products are not saved yet
  const url = new URL(`${baseUrl}/products/${product.id}`);
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  await apiFetch(url, { method: 'DELETE', headers: headers });
  return;
}
