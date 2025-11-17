import { getToken } from '@/services/api/authentication';
import { getProduct } from '@/services/api/fetching';
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
  return {
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
}

export async function saveProduct(product: Product): Promise<number> {
  if (product.id === 'new') {
    return await saveNewProduct(product);
  } else {
    return await updateProduct(product);
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

  const response = await fetch(url, { method: 'POST', headers: headers, body: body });
  const data = await response.json();

  console.log('Created product:', data);
  product.id = data.id; // Update product ID to the newly assigned ID so we can add images

  await updateProductImages(product);
  await updateProductVideos(product);

  return data.id;
}

async function updateProduct(product: Product): Promise<number> {
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
  const response = await fetch(url, { method: 'PATCH', headers: headers, body: productBody });

  url = new URL(baseUrl + `/products/${product.id}/physical_properties`);
  await fetch(url, { method: 'PATCH', headers: headers, body: propertiesBody });

  url = new URL(baseUrl + `/products/${product.id}/circularity_properties`);
  await fetch(url, { method: 'PATCH', headers: headers, body: circularityBody });

  await updateProductImages(product);
  await updateProductVideos(product);

  const data = await response.json();

  return data.id;
}

async function updateProductImages(product: Product) {
  const currentImages = await getProduct(product.id);
  const imagesToDelete = currentImages.images.filter((img) => !product.images.some((i) => i.id === img.id));
  const imagesToAdd = product.images.filter((img) => !img.id);

  for (const img of imagesToDelete) {
    await deleteImage(product, img);
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
  return await fetch(url, { method: 'DELETE', headers: headers });
}

async function addImage(product: Product, image: { url: string; description: string }) {
  const url = new URL(baseUrl + `/products/${product.id}/images`);
  const token = await getToken();
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = new FormData();

  if (image.url.startsWith('data:')) {
    body.append('file', dataURItoBlob(image.url), 'image.png');
  } else if (image.url.startsWith('file:')) {
    console.log(image.url);
    body.append('file', { uri: image.url, name: 'image.png', type: 'image/png' } as any);
  } else if (image.url.startsWith('blob:')) {
    // Fetch the blob from the blob URL
    const response = await fetch(image.url);
    const blob = await response.blob();
    body.append('file', blob, 'image.png');
  }

  await fetch(url, { method: 'POST', headers: headers, body: body });
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

async function updateProductVideos(product: Product) {
  const currentProduct = await getProduct(product.id);
  const currentVideos = currentProduct.videos || [];
  const videosToDelete = currentVideos.filter((vid) => !product.videos.some((v) => v.id === vid.id));
  const videosToAdd = product.videos.filter((vid) => !vid.id);
  const videosToUpdate = product.videos.filter((vid) => {
    const orig = currentVideos.find((v) => v.id === vid.id);
    return orig && (orig.url !== vid.url
        || orig.description !== vid.description
        || orig.title !== vid.title
    );
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

async function addVideo(product: Product, video: { url: string; description: string, title: string, }) {
  const url = new URL(baseUrl + `/products/${product.id}/videos`);
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const body = JSON.stringify({ url: video.url, description: video.description, title: video.title });
  await fetch(url, { method: 'POST', headers, body });
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
  await fetch(url, { method: 'DELETE', headers });
}

async function updateVideo(product: Product, video: { id?: number; url: string; description: string, title: string, }) {
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
  await fetch(url, { method: 'PATCH', headers, body });
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
  await fetch(url, { method: 'DELETE', headers: headers });
  return;
}
