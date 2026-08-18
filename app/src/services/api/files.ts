import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import type { ApiFileRead } from '@/types/api';
import type { Product } from '@/types/Product';
import { throwFromResponse } from './errors';

/**
 * Research-file attachments (non-image uploads).
 *
 * Unlike images, files are not part of the product draft: they are attached to a
 * record that already exists and are uploaded and removed immediately, so nothing
 * here participates in the save cycle.
 *
 * The backend restricts these routes to `lab` accounts. Hiding the affordance from
 * everyone else is presentation only — the control is the route dependency.
 */

/** Extensions the backend's generic-upload allowlist accepts. */
export const RESEARCH_FILE_EXTENSIONS = [
  'csv',
  'dat',
  'docx',
  'h5',
  'hdf5',
  'hdr',
  'img',
  'json',
  'md',
  'nitf',
  'ntf',
  'pdf',
  'pptx',
  'raw',
  'tif',
  'tiff',
  'tsv',
  'txt',
  'xlsx',
] as const;

export const MAX_RESEARCH_FILE_BYTES = 50 * 1024 * 1024; // mirrors max_file_upload_size_mb

function filesUrl(product: Product): URL {
  const root = product.role === 'component' ? 'components' : 'products';
  return new URL(`${API_URL}/${root}/${product.id}/files`);
}

export function isAllowedResearchFilename(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  return (
    !!extension &&
    extension !== filename.toLowerCase() &&
    (RESEARCH_FILE_EXTENSIONS as readonly string[]).includes(extension)
  );
}

export async function fetchProductFiles(product: Product): Promise<ApiFileRead[]> {
  const url = filesUrl(product);
  url.searchParams.set('size', '50');
  const response = await fetchWithAuth(url, { method: 'GET' });
  if (!response.ok) await throwFromResponse(response, 'Failed to load files');
  const data = await response.json();
  return (data.items ?? []) as ApiFileRead[];
}

export type ResearchFileUpload = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
};

export async function uploadProductFile(
  product: Product,
  file: ResearchFileUpload,
  description?: string,
): Promise<ApiFileRead> {
  if (!isAllowedResearchFilename(file.name)) {
    throw new Error(`${file.name} is not a supported research file type.`);
  }
  if (typeof file.size === 'number' && file.size > MAX_RESEARCH_FILE_BYTES) {
    throw new Error('File is too large. Please use a file smaller than 50 MB.');
  }

  const body = new FormData();
  if (file.uri.startsWith('file:') || file.uri.startsWith('content:')) {
    // React Native extends FormData to accept { uri, name, type } so the file is
    // streamed from disk rather than read into JS.
    body.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/octet-stream',
    } as unknown as Blob);
  } else {
    const blob = await (await fetch(file.uri)).blob();
    if (blob.size > MAX_RESEARCH_FILE_BYTES) {
      throw new Error('File is too large. Please use a file smaller than 50 MB.');
    }
    body.append('file', blob, file.name);
  }
  if (description) body.append('description', description);

  const response = await fetchWithAuth(filesUrl(product), {
    method: 'POST',
    body,
    timeoutMs: 120_000,
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to upload file');
  return (await response.json()) as ApiFileRead;
}

export async function deleteProductFile(product: Product, fileId: string): Promise<void> {
  const response = await fetchWithAuth(new URL(`${filesUrl(product).toString()}/${fileId}`), {
    method: 'DELETE',
  });
  // Already gone server-side is the outcome the caller wanted.
  if (response.status === 404) return;
  if (!response.ok) await throwFromResponse(response, 'Failed to remove file');
}
