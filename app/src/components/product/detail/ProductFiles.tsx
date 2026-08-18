import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import { IconButton } from '@/components/base/IconButton';
import { useProductFiles } from '@/features/products/useProductFiles';
import type { Product } from '@/types/Product';

type Props = {
  product: Product;
  editMode: boolean;
};

/**
 * Research files attached to a record: datasets, manuals, measurement exports.
 *
 * Rendered only for lab accounts. That is presentation, not a control — the
 * backend refuses the upload route to anyone below the lab tier regardless.
 */
export default function ProductFiles({ product, editMode }: Props) {
  const {
    canManage,
    isLab,
    files,
    isLoading,
    isUploading,
    pickAndUpload,
    removeFile,
    removingFileId,
  } = useProductFiles(product);

  // Nothing to show a contributor: no files they could read, no picker they could use.
  if (!isLab) return null;
  if (!isLoading && files.length === 0 && !(canManage && editMode)) return null;

  return (
    <View className="mt-6">
      <DetailSectionHeader title="Research files" />

      {files.length === 0 ? (
        <AppText variant="body" className="text-muted-foreground">
          {isLoading ? 'Loading files…' : 'No research files attached.'}
        </AppText>
      ) : (
        <View className="gap-2">
          {files.map((file) => (
            <View key={file.id} className="flex-row items-center gap-2">
              <View className="flex-1">
                <AppText variant="body">{file.filename}</AppText>
                {file.description ? (
                  <AppText variant="caption" className="text-muted-foreground">
                    {file.description}
                  </AppText>
                ) : null}
              </View>
              {canManage && editMode ? (
                <IconButton
                  icon="trash-2"
                  accessibilityLabel={`Remove ${file.filename}`}
                  loading={removingFileId === file.id}
                  // biome-ignore lint/performance/noJsxPropsBind: the handler needs this row's file id; the list is short and re-renders only on an invalidate.
                  onPress={() => removeFile(file.id)}
                />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {canManage && editMode ? (
        <AppButton
          variant="ghost"
          className="mt-2 self-start px-2"
          disabled={isUploading}
          onPress={pickAndUpload}
        >
          <AppText variant="body">{isUploading ? 'Uploading…' : 'Add research file'}</AppText>
        </AppButton>
      ) : null}
    </View>
  );
}
