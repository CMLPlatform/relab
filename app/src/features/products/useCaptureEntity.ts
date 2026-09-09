import { useEffect, useRef, useState } from 'react';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { newProduct } from '@/services/api/products';
import { createRequestId } from '@/services/api/request';
import { PRODUCT_NAME_MIN_LENGTH } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';
import { QUEUED_OFFLINE_LABEL, useSaveProductMutation } from './queries';

const DEFAULT_AMOUNT = 1;

export type UseCaptureEntityOptions = {
  role: 'product' | 'component';
  parentID?: number;
  parentRole?: 'product' | 'component';
};

/** State + save flow for the capture-first creation screen. No react-hook-form: three fields. */
export function useCaptureEntity({ role, parentID, parentRole }: UseCaptureEntityOptions) {
  const feedback = useAppFeedback();
  const saveMutation = useSaveProductMutation();

  // Announce the queued-offline state once per pause.
  useEffect(() => {
    if (saveMutation.isPaused) feedback.toast(QUEUED_OFFLINE_LABEL);
  }, [saveMutation.isPaused, feedback]);

  const [name, setName] = useState('');
  const [typeID, setTypeID] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [images, setImages] = useState<Product['images']>([]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length >= PRODUCT_NAME_MIN_LENGTH && !saveMutation.isPending;
  // A typeID kept by createAndAddAnother is a preference, not unsaved data.
  const isDirty = trimmedName.length > 0 || (images?.length ?? 0) > 0 || amount !== DEFAULT_AMOUNT;

  // Guards both entry points below against a double Create (Enter-submit +
  // click can both fire before the disabled/loading state re-renders).
  const inFlightRef = useRef(false);

  // One key per draft, not per Create tap: see useProductForm's saveAndExit.
  const idempotencyKeyRef = useRef<string | null>(null);

  const performCreate = async (): Promise<{ id: number; partial: boolean } | undefined> => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    try {
      const draft = newProduct({ parentID, parentRole });
      // Pin the role: newProduct() derives it from parentID, and a malformed
      // /components/new URL would otherwise POST a top-level product.
      draft.role = role;
      draft.name = trimmedName;
      draft.productTypeID = typeID;
      draft.images = images;
      draft.amountInParent = role === 'component' ? amount : undefined;

      try {
        // Held across retries, rehydration and manual re-taps until one lands.
        idempotencyKeyRef.current ??= createRequestId();
        const id = await saveMutation.mutateAsync({
          product: draft,
          originalImages: [],
          originalVideos: [],
          idempotencyKey: idempotencyKeyRef.current,
        });
        idempotencyKeyRef.current = null;
        return { id, partial: false };
      } catch (err) {
        // saveNewProduct() POSTs, sets draft.id, then uploads images; a rejection
        // with draft.id already set means only the upload failed.
        if (typeof draft.id === 'number') {
          // The record landed, so the key has done its job.
          idempotencyKeyRef.current = null;
          feedback.error('Created, but some photos failed to upload.', 'Upload failed');
          return { id: draft.id, partial: true };
        }
        feedback.error(
          getErrorMessage(err, 'Could not create. Please try again.'),
          'Create failed',
        );
        return undefined;
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  const create = async (): Promise<number | undefined> => {
    const result = await performCreate();
    return result?.id;
  };

  const createAndAddAnother = async (): Promise<{ id: number; partial: boolean } | undefined> => {
    const savedName = trimmedName;
    const result = await performCreate();
    // Partial success (record created, upload failed): do not toast success
    // or reset the form, which would discard the photos that failed.
    if (result === undefined || result.partial) return result;

    feedback.toast(`${savedName} added`);
    setName('');
    setImages([]);
    setAmount(DEFAULT_AMOUNT);
    return result;
  };

  return {
    name,
    setName,
    typeID,
    setTypeID,
    amount,
    setAmount,
    images,
    setImages,
    canCreate,
    isCreating: saveMutation.isPending,
    isPaused: saveMutation.isPaused,
    isDirty,
    create,
    createAndAddAnother,
  };
}
