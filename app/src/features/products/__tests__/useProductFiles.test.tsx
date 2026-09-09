import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { useProductFiles } from '@/features/products/useProductFiles';
import type { Product } from '@/types/Product';

const mockToast = jest.fn();
const mockError = jest.fn();
const mockUser: { role: string } | null = { role: 'lab' };

jest.mock('@/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({ toast: mockToast, error: mockError }),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('@/services/api/files', () => {
  const actual = jest.requireActual('@/services/api/files') as Record<string, unknown>;
  return {
    ...actual,
    fetchProductFiles: jest.fn(async () => []),
    uploadProductFile: jest.fn(async () => ({ id: 'file-1' })),
    deleteProductFile: jest.fn(async () => undefined),
  };
});

const { getDocumentAsync } = jest.requireMock('expo-document-picker') as {
  getDocumentAsync: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
};
const { fetchProductFiles, uploadProductFile, deleteProductFile } = jest.requireMock(
  '@/services/api/files',
) as {
  fetchProductFiles: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  uploadProductFile: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  deleteProductFile: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
};

const product = { id: 7, role: 'product', ownedBy: 'me' } as unknown as Product;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const asset = (name: string, size?: number) => ({
  uri: `file:///tmp/${name}`,
  name,
  mimeType: 'application/octet-stream',
  size,
});

async function renderUseProductFiles(record: Product = product) {
  const view = await renderHook(() => useProductFiles(record), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe('useProductFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.role = 'lab';
    fetchProductFiles.mockResolvedValue([]);
    uploadProductFile.mockResolvedValue({ id: 'file-1' });
    deleteProductFile.mockResolvedValue(undefined);
  });

  it('uploads each picked asset with the fields the service needs', async () => {
    getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [asset('scan.csv', 10), asset('notes.md', 20)],
    });
    const { result } = await renderUseProductFiles();

    await act(() => result.current.pickAndUpload());

    expect(uploadProductFile).toHaveBeenCalledTimes(2);
    expect(uploadProductFile).toHaveBeenNthCalledWith(1, product, {
      uri: 'file:///tmp/scan.csv',
      name: 'scan.csv',
      mimeType: 'application/octet-stream',
      size: 10,
    });
    expect(mockToast).toHaveBeenCalledWith('Added scan.csv.');
    expect(mockError).not.toHaveBeenCalled();
  });

  it('skips a cancelled picker without uploading', async () => {
    getDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    const { result } = await renderUseProductFiles();

    await act(() => result.current.pickAndUpload());

    expect(uploadProductFile).not.toHaveBeenCalled();
  });

  it('reports the failure and keeps going with the rest of the batch', async () => {
    getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [asset('scan.csv'), asset('notes.md')],
    });
    uploadProductFile.mockRejectedValueOnce(new Error('Upload quota exceeded.'));
    const { result } = await renderUseProductFiles();

    await act(() => result.current.pickAndUpload());

    expect(mockError).toHaveBeenCalledWith('Upload quota exceeded.', 'Upload failed');
    expect(uploadProductFile).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported extension and an oversized asset locally', async () => {
    getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [asset('payload.exe'), asset('huge.h5', 51 * 1024 * 1024)],
    });
    const { result } = await renderUseProductFiles();

    await act(() => result.current.pickAndUpload());

    expect(uploadProductFile).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('payload.exe is not a research file format'),
      'Unsupported file type',
    );
    expect(mockError).toHaveBeenCalledWith(
      'huge.h5 is over the 50 MB limit for a single file.',
      'File too large',
    );
  });

  it('removes a file and confirms it', async () => {
    const { result } = await renderUseProductFiles();

    await act(() => {
      result.current.removeFile('file-1');
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('File removed.'));
    expect(deleteProductFile).toHaveBeenCalledWith(product, 'file-1');
  });

  it('reports a failed removal', async () => {
    deleteProductFile.mockRejectedValueOnce(new Error('Not your record.'));
    const { result } = await renderUseProductFiles();

    await act(() => {
      result.current.removeFile('file-1');
    });

    await waitFor(() =>
      expect(mockError).toHaveBeenCalledWith('Not your record.', 'Could not remove file'),
    );
  });

  // `canManage` is presentation only (the backend enforces), but it must not
  // offer file management to accounts or records that cannot use it.
  it('withholds management from non-lab accounts, other owners, and unsaved drafts', async () => {
    mockUser.role = 'user';
    const nonLab = await renderUseProductFiles();
    expect(nonLab.result.current.canManage).toBe(false);
    expect(nonLab.result.current.isLab).toBe(false);
    expect(fetchProductFiles).not.toHaveBeenCalled();

    mockUser.role = 'lab';
    const otherOwner = await renderUseProductFiles({ ...product, ownedBy: 'other' } as Product);
    expect(otherOwner.result.current.canManage).toBe(false);

    const draft = await renderUseProductFiles({ ...product, id: undefined } as unknown as Product);
    expect(draft.result.current.canManage).toBe(false);
  });
});
