import { useEffect, useState } from 'react';
import { getLocalItem, setLocalItem } from '@/services/storage';
import { logError } from '@/utils/logging';

function getGalleryStorageKey(productId: number | null) {
  return `product_gallery_index_${productId}`;
}

export function useGalleryIndexPersistence({
  productId,
  imageCount,
}: {
  productId: number | null;
  imageCount: number;
}) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  useEffect(() => {
    const loadLastIndex = async () => {
      try {
        const saved = await getLocalItem(getGalleryStorageKey(productId));
        if (saved === null) return;

        const index = Number.parseInt(saved, 10);
        if (index >= 0 && index < imageCount) {
          setPendingIndex(index);
        }
      } catch (error) {
        logError('Failed to load gallery index', error);
      }
    };

    if (productId && imageCount > 0) {
      loadLastIndex().catch(() => {});
    }
  }, [imageCount, productId]);

  const persistIndex = async (index: number) => {
    try {
      await setLocalItem(getGalleryStorageKey(productId), String(index));
    } catch (error) {
      logError('Failed to save gallery index', error);
    }
  };

  const consumePendingIndex = () => {
    setPendingIndex(null);
  };

  return {
    pendingIndex,
    consumePendingIndex,
    persistIndex,
  };
}
