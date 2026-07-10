import { useCallback, useEffect, useEffectEvent } from 'react';
import { getLocalItem, setLocalItem } from '@/services/storage';
import { logError } from '@/utils/logging';

function getGalleryStorageKey(productId: number) {
  return `product_gallery_index_${productId}`;
}

/**
 * Restores and persists the last-viewed gallery index for a product.
 *
 * The restored index is handed to `onRestore` rather than parked in state: the
 * consumer has to both select and scroll to it, and driving that from an effect
 * watching a state value is what let the counter desync from the visible slide.
 */
export function useGalleryIndexPersistence({
  productId,
  imageCount,
  onRestore,
}: {
  productId: number | null;
  imageCount: number;
  onRestore: (index: number) => void;
}) {
  const restore = useEffectEvent(onRestore);

  useEffect(() => {
    if (productId === null || imageCount <= 0) return;

    let cancelled = false;
    const loadLastIndex = async () => {
      try {
        const saved = await getLocalItem(getGalleryStorageKey(productId));
        if (saved === null || cancelled) return;

        const index = Number.parseInt(saved, 10);
        if (index >= 0 && index < imageCount) {
          restore(index);
        }
      } catch (error) {
        logError('Failed to load gallery index', error);
      }
    };

    void loadLastIndex();
    return () => {
      cancelled = true;
    };
  }, [imageCount, productId]);

  const persistIndex = useCallback(
    async (index: number) => {
      if (productId === null) return;
      try {
        await setLocalItem(getGalleryStorageKey(productId), String(index));
      } catch (error) {
        logError('Failed to save gallery index', error);
      }
    },
    [productId],
  );

  return { persistIndex };
}
