import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type DocumentPickerAsset, getDocumentAsync } from 'expo-document-picker';
import { useCallback } from 'react';
import { useAuth } from '@/context/auth';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import {
  deleteProductFile,
  fetchProductFiles,
  isAllowedResearchFilename,
  MAX_RESEARCH_FILE_BYTES,
  RESEARCH_FILE_EXTENSIONS,
  uploadProductFile,
} from '@/services/api/files';
import type { Product } from '@/types/Product';

export const productFilesQueryKey = (productId: number | undefined) =>
  ['product-files', productId] as const;

/**
 * Research-file attachments for one saved record.
 *
 * `canManage` is presentation only: it decides whether to render the picker, and
 * the backend refuses a non-lab upload regardless of what the client shows.
 */
export function useProductFiles(product: Product) {
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const queryClient = useQueryClient();

  // An unsaved draft has no id to attach a file to, so there is nothing to fetch
  // and nothing to upload against until it has been saved once.
  const productId = typeof product.id === 'number' ? product.id : undefined;
  const isLab = user?.role === 'lab';
  const canManage = isLab && product.ownedBy === 'me' && productId !== undefined;

  const filesQuery = useQuery({
    queryKey: productFilesQueryKey(productId),
    queryFn: () => fetchProductFiles(product),
    enabled: isLab && productId !== undefined,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: productFilesQueryKey(productId) }),
    [queryClient, productId],
  );

  const uploadMutation = useMutation({
    mutationFn: (file: DocumentPickerAsset) =>
      uploadProductFile(product, {
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      }),
    onSuccess: async (_result, file) => {
      await invalidate();
      feedback.toast(`Added ${file.name}.`);
    },
    onError: (error: Error) => {
      feedback.error(error.message, 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteProductFile(product, fileId),
    onSuccess: async () => {
      await invalidate();
      feedback.toast('File removed.');
    },
    onError: (error: Error) => {
      feedback.error(error.message, 'Could not remove file');
    },
  });

  const pickAndUpload = useCallback(async () => {
    const result = await getDocumentAsync({
      // The allowlist is by extension server-side, and pickers report types
      // inconsistently across platforms, so accept anything and validate the
      // filename here rather than trusting a MIME filter to have held.
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;

    for (const asset of result.assets) {
      if (!isAllowedResearchFilename(asset.name)) {
        feedback.error(
          `${asset.name} is not a research file format. Allowed: ${RESEARCH_FILE_EXTENSIONS.join(', ')}.`,
          'Unsupported file type',
        );
        continue;
      }
      if (typeof asset.size === 'number' && asset.size > MAX_RESEARCH_FILE_BYTES) {
        feedback.error(
          `${asset.name} is over the 50 MB limit for a single file.`,
          'File too large',
        );
        continue;
      }
      // Sequential on purpose: parallel large uploads overwhelm the server, the
      // same reason image uploads run one at a time.
      // biome-ignore lint/performance/noAwaitInLoops: sequential upload is deliberate.
      await uploadMutation.mutateAsync(asset).catch(() => undefined);
    }
  }, [feedback, uploadMutation]);

  return {
    canManage,
    isLab,
    files: filesQuery.data ?? [],
    isLoading: filesQuery.isLoading,
    isUploading: uploadMutation.isPending,
    pickAndUpload,
    removeFile: deleteMutation.mutate,
    removingFileId: deleteMutation.isPending ? deleteMutation.variables : undefined,
  };
}
