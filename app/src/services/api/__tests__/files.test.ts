import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  deleteProductFile,
  fetchProductFiles,
  isAllowedResearchFilename,
  MAX_RESEARCH_FILE_BYTES,
  RESEARCH_FILE_EXTENSIONS,
  uploadProductFile,
} from '@/services/api/files';
import type { Product } from '@/types/Product';

const TOO_LARGE_PATTERN = /smaller than 50 MB/;

describe('isAllowedResearchFilename', () => {
  it.each(RESEARCH_FILE_EXTENSIONS)('accepts a .%s file', (extension) => {
    expect(isAllowedResearchFilename(`sample.${extension}`)).toBe(true);
  });

  it('matches the extension case-insensitively', () => {
    expect(isAllowedResearchFilename('SCAN.H5')).toBe(true);
  });

  it('reads only the final extension, so dotted research filenames pass', () => {
    // Mirrors the backend, which takes Path(name).suffix — "sample.v2.csv" is a
    // legitimate research filename, not a double-extension bypass attempt.
    expect(isAllowedResearchFilename('sample.v2.csv')).toBe(true);
    expect(isAllowedResearchFilename('report.csv.exe')).toBe(false);
  });

  it.each(['payload.svg', 'script.sh', 'archive.zip', 'photo.jpg'])('rejects %s', (filename) => {
    expect(isAllowedResearchFilename(filename)).toBe(false);
  });

  it('rejects a name with no extension at all', () => {
    expect(isAllowedResearchFilename('README')).toBe(false);
    expect(isAllowedResearchFilename('csv')).toBe(false);
  });
});

jest.mock('@/services/api/auth/authentication', () => ({
  fetchWithAuth: jest.fn(),
}));

const { fetchWithAuth } = jest.requireMock('@/services/api/auth/authentication') as {
  fetchWithAuth: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
};

const product = { id: 7, role: 'product' } as unknown as Product;
const component = { id: 9, role: 'component' } as unknown as Product;

function lastUrl(): URL {
  return (fetchWithAuth.mock.calls.at(-1) as unknown as [URL, RequestInit])[0];
}

describe('fetchProductFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads a product record from /products and a component from /components', async () => {
    fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) } as never);

    await fetchProductFiles(product);
    expect(lastUrl().pathname).toBe('/v1/products/7/files');

    await fetchProductFiles(component);
    expect(lastUrl().pathname).toBe('/v1/components/9/files');
    expect(lastUrl().searchParams.get('size')).toBe('50');
  });

  it('returns an empty list when the page body carries no items', async () => {
    fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({}) } as never);

    await expect(fetchProductFiles(product)).resolves.toEqual([]);
  });

  it('raises the server detail when the read is refused', async () => {
    fetchWithAuth.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Lab accounts only.' }),
    } as never);

    await expect(fetchProductFiles(product)).rejects.toThrow('Lab accounts only.');
  });
});

describe('uploadProductFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ id: 'file-1' }) } as never);
  });

  // The client-side half of the upload trust boundary: the backend re-checks,
  // but neither guard may be skipped here or the user gets a 4xx instead of a
  // readable message.
  it('refuses a filename outside the research-file allowlist before any request', async () => {
    await expect(
      uploadProductFile(product, { uri: 'file:///tmp/x.exe', name: 'x.exe' }),
    ).rejects.toThrow('x.exe is not a supported research file type.');
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('refuses a picker-reported size over the 50 MB cap before any request', async () => {
    await expect(
      uploadProductFile(product, {
        uri: 'file:///tmp/scan.h5',
        name: 'scan.h5',
        size: MAX_RESEARCH_FILE_BYTES + 1,
      }),
    ).rejects.toThrow(TOO_LARGE_PATTERN);
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it.each(['file:///tmp/scan.h5', 'content://media/scan.h5'])(
    'streams %s from disk rather than reading it into JS',
    async (uri) => {
      global.fetch = jest.fn() as unknown as typeof fetch;
      // Node's spec FormData stringifies the { uri, name, type } descriptor that
      // React Native's accepts, so inspect what was appended instead.
      const append = jest.spyOn(FormData.prototype, 'append');

      await uploadProductFile(product, { uri, name: 'scan.h5', mimeType: null }, 'Raw scan');

      expect(global.fetch).not.toHaveBeenCalled();
      const fileEntry = append.mock.calls.find(([field]) => field === 'file')?.[1];
      expect(fileEntry).toEqual({ uri, name: 'scan.h5', type: 'application/octet-stream' });
      expect(append.mock.calls).toContainEqual(['description', 'Raw scan']);
      append.mockRestore();

      const [url, init] = fetchWithAuth.mock.calls.at(-1) as unknown as [URL, RequestInit];
      expect(url.pathname).toBe('/v1/products/7/files');
      expect(init.method).toBe('POST');
    },
  );

  it('re-checks the real byte size of a web blob the picker under-reported', async () => {
    global.fetch = jest.fn(async () => ({
      blob: async () => ({ size: MAX_RESEARCH_FILE_BYTES + 1 }),
    })) as unknown as typeof fetch;

    await expect(
      uploadProductFile(product, { uri: 'blob:https://relab.test/abc', name: 'scan.csv', size: 1 }),
    ).rejects.toThrow(TOO_LARGE_PATTERN);
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('uploads a web blob under the cap', async () => {
    const blob = new Blob(['a,b\n1,2\n']);
    global.fetch = jest.fn(async () => ({ blob: async () => blob })) as unknown as typeof fetch;

    await expect(
      uploadProductFile(component, { uri: 'blob:https://relab.test/abc', name: 'scan.csv' }),
    ).resolves.toEqual({ id: 'file-1' });
    const [url, init] = fetchWithAuth.mock.calls.at(-1) as unknown as [
      URL,
      RequestInit & { body: FormData },
    ];
    expect(url.pathname).toBe('/v1/components/9/files');
    expect(init.body.get('description')).toBeNull();
  });

  it('raises the server detail when the upload is rejected', async () => {
    fetchWithAuth.mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ detail: 'Upload quota exceeded.' }),
    } as never);

    await expect(
      uploadProductFile(product, { uri: 'file:///tmp/scan.h5', name: 'scan.h5' }),
    ).rejects.toThrow('Upload quota exceeded.');
  });
});

describe('deleteProductFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes against the record-specific files route', async () => {
    fetchWithAuth.mockResolvedValue({ ok: true, status: 204 } as never);

    await expect(deleteProductFile(component, 'file-1')).resolves.toBeUndefined();
    const [url, init] = fetchWithAuth.mock.calls.at(-1) as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/v1/components/9/files/file-1');
    expect(init.method).toBe('DELETE');
  });

  // Removing a file that is already gone is the outcome the caller wanted.
  it('treats a 404 as success', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false, status: 404 } as never);

    await expect(deleteProductFile(product, 'file-1')).resolves.toBeUndefined();
  });

  it('raises on any other failure', async () => {
    fetchWithAuth.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Not your record.' }),
    } as never);

    await expect(deleteProductFile(product, 'file-1')).rejects.toThrow('Not your record.');
  });
});
