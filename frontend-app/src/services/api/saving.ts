import { getToken } from '@/services/api/authentication';
import { apiFetch } from '@/services/api/fetching';
import { Product } from '@/types/Product';

// TODO: Break up the saving logic into smaller files
// TODO: Refactor the types to build on the generated API client from OpenAPI spec

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;

function toNewProduct(product: Product): any {
  const isComponent = typeof product.parentID === 'number' && !isNaN(product.parentID);

  return {
    name: product.name,
    brand: product.brand,
    model: product.model,
    description: product.description,
    // TODO: Handle bill of materials properly
    bill_of_materials: [
      {
        quantity: 42,
        unit: 'g',
        material_id: 1,
      },
    ],
    physical_properties: toUpdatePhysicalProperties(product),
    circularity_properties: toUpdateCircularityProperties(product),
    product_type_id: product.productTypeID ? product.productTypeID : null,
    videos: product.videos,
    // Only include amountInParent if this is a component (has a parent)
    ...(isComponent && { amount_in_parent: product.amountInParent ?? 1 }),
  };
}

function toUpdateProduct(product: Product): any {
  const isComponent = typeof product.parentID === 'number' && !isNaN(product.parentID);

  return {
    name: product.name,
    brand: product.brand,
    model: product.model,
    description: product.description,
    product_type_id: product.productTypeID ? product.productTypeID : null,
    // Only include amount_in_parent if this is a component (has a parent)
    ...(isComponent && { amount_in_parent: product.amountInParent ?? 1 }),
  };
}

function toUpdatePhysicalProperties(product: Product): any {
  return {
    weight_g: product.physicalProperties.weight || null,
    height_cm: product.physicalProperties.height || null,
    width_cm: product.physicalProperties.width || null,
    depth_cm: product.physicalProperties.depth || null,
  };
}

function toUpdateCircularityProperties(product: Product): any {
  const out = {
    recyclability_comment: product.circularityProperties.recyclabilityComment ?? null,
    recyclability_observation: product.circularityProperties.recyclabilityObservation,
    recyclability_reference: product.circularityProperties.recyclabilityReference ?? null,
    remanufacturability_comment: product.circularityProperties.remanufacturabilityComment ?? null,
    remanufacturability_observation: product.circularityProperties.remanufacturabilityObservation,
    remanufacturability_reference: product.circularityProperties.remanufacturabilityReference ?? null,
    repairability_comment: product.circularityProperties.repairabilityComment ?? null,
    repairability_observation: product.circularityProperties.repairabilityObservation,
    repairability_reference: product.circularityProperties.repairabilityReference ?? null,
  };

  // If all values are null, return null so the caller can omit the object
  const hasAny = Object.values(out).some((v) => v !== null);
  return hasAny ? out : null;
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
  if (product.id === 'new') {
    return await saveNewProduct(product);
  } else {
    return await updateProduct(product, originalImages, originalVideos);
  }
}

async function saveNewProduct(product: Product): Promise<number> {
  // If product has a parent, it's a component - use the components endpoint
  const url =
    typeof product.parentID === 'number' && !isNaN(product.parentID)
      ? new URL(`${baseUrl}/products/${product.parentID}/components`)
      : new URL(baseUrl + '/products');

  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = JSON.stringify(toNewProduct(product));

  const response = await apiFetch(url, { method: 'POST', headers: headers, body: body });

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new Error(`Failed to save product: ${errData?.detail?.[0]?.msg || errData?.detail || response.statusText}`);
  }

  const data = await response.json();

  product.id = data.id; // Update product ID to the newly assigned ID so we can add images

  // New product has no existing media on the server yet
  await updateProductImages(product, []);
  await updateProductVideos(product, []);

  return data.id;
}

async function updateProduct(
  product: Product,
  originalImages: Product['images'],
  originalVideos: Product['videos'],
): Promise<number> {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const productBody = JSON.stringify(toUpdateProduct(product));
  const propertiesBody = JSON.stringify(toUpdatePhysicalProperties(product));
  const circularityBody = JSON.stringify(toUpdateCircularityProperties(product));

  let url = new URL(baseUrl + `/products/${product.id}`);
  let response = await apiFetch(url, { method: 'PATCH', headers: headers, body: productBody });
  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new Error(`Failed to update product: ${errData?.detail?.[0]?.msg || errData?.detail || response.statusText}`);
  }

  url = new URL(baseUrl + `/products/${product.id}/physical_properties`);
  response = await apiFetch(url, { method: 'PATCH', headers: headers, body: propertiesBody });
  if (!response.ok && response.status !== 404) {
    const errData = await response.json().catch(() => null);
    throw new Error(
      `Failed to update physical properties: ${errData?.detail?.[0]?.msg || errData?.detail || response.statusText}`,
    );
  } else if (response.status === 404 && circularityBody !== 'null') {
    // If 404, it might not exist yet; the backend can create it later if needed.
  }

  url = new URL(baseUrl + `/products/${product.id}/circularity_properties`);
  response = await apiFetch(url, { method: 'PATCH', headers: headers, body: circularityBody });
  if (!response.ok && response.status !== 404) {
    const errData = await response.json().catch(() => null);
    throw new Error(
      `Failed to update circularity properties: ${errData?.detail?.[0]?.msg || errData?.detail || response.statusText}`,
    );
  }

  await updateProductImages(product, originalImages);
  await updateProductVideos(product, originalVideos);

  const data = await response.json();

  return data.id;
}

async function updateProductImages(product: Product, originalImages: Product['images']) {
  const imagesToDelete = originalImages.filter((img) => !product.images.some((i) => i.id === img.id));
  const imagesToAdd = product.images.filter((img) => !img.id);

  for (const img of imagesToDelete) {
    if (img.id !== undefined) {
      await deleteImage(product, img as { id: number });
    }
  }

  for (const img of imagesToAdd) {
    await addImage(product, img);
  }
}

async function deleteImage(product: Product, image: { id: number }) {
  const url = new URL(baseUrl + `/products/${product.id}/images/${image.id}`);
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  return await apiFetch(url, { method: 'DELETE', headers: headers });
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

async function addImage(product: Product, image: { url: string; description: string }) {
  const url = new URL(baseUrl + `/products/${product.id}/images`);
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = new FormData();

  if (image.url.startsWith('data:')) {
    const fileBlob = dataURItoBlob(image.url);
    if (fileBlob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image is too large. Please use an image smaller than 10 MB.');
    }
    body.append('file', fileBlob, 'image.png');
  } else if (image.url.startsWith('file:')) {
    body.append('file', { uri: image.url, name: 'image.png', type: 'image/png' } as any);
  } else if (image.url.startsWith('blob:') || image.url.startsWith('http')) {
    // Web blob or URL - fetch and convert to blob
    const response = await fetch(image.url);
    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Image is too large. Please use an image smaller than 10 MB.');
    }
    body.append('file', blob, 'image.png');
  }

  const response = await apiFetch(url, { method: 'POST', headers: headers, body: body, timeoutMs: 30_000 });
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
        (image as any).id = data.id;
      }
      const newUrl = data.url || data.image_url || data.file_url || data.path || data.location;
      if (newUrl) {
        (image as any).url = newUrl;
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

async function updateProductVideos(product: Product, originalVideos: Product['videos']) {
  const currentVideos = originalVideos || [];
  const videosToDelete = currentVideos.filter((vid) => !product.videos.some((v) => v.id === vid.id));
  const videosToAdd = product.videos.filter((vid) => !vid.id);
  const videosToUpdate = product.videos.filter((vid) => {
    const orig = currentVideos.find((v) => v.id === vid.id);
    return orig && (orig.url !== vid.url || orig.description !== vid.description || orig.title !== vid.title);
  });

  for (const vid of videosToDelete) {
    await deleteVideo(product, vid);
  }
  for (const vid of videosToAdd) {
    await addVideo(product, vid);
  }
  for (const vid of videosToUpdate) {
    await updateVideo(product, vid);
  }
}

async function addVideo(product: Product, video: { url: string; description: string; title: string }) {
  const url = new URL(baseUrl + `/products/${product.id}/videos`);
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = JSON.stringify({ url: video.url, description: video.description, title: video.title });
  await apiFetch(url, { method: 'POST', headers, body });
}

async function deleteVideo(product: Product, video: { id?: number }) {
  if (!video.id) {
    return;
  }

  const url = new URL(baseUrl + `/products/${product.id}/videos/${video.id}`);
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  await apiFetch(url, { method: 'DELETE', headers });
}

async function updateVideo(product: Product, video: { id?: number; url: string; description: string; title: string }) {
  if (!video.id) {
    return;
  }

  const url = new URL(baseUrl + `/products/${product.id}/videos/${video.id}`);
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = JSON.stringify({ url: video.url, description: video.description, title: video.title });
  await apiFetch(url, { method: 'PATCH', headers, body });
}

export async function deleteProduct(product: Product): Promise<void> {
  if (product.id === 'new') {
    return;
  } // New products are not saved yet
  const url = new URL(baseUrl + `/products/${product.id}`);
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  await apiFetch(url, { method: 'DELETE', headers: headers });
  return;
}
