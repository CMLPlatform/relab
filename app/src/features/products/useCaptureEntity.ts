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

/**
 * Minimal state + save flow for the capture-first creation screen: a name,
 * an optional type, a photo set, and (for components) a parent amount — no
 * react-hook-form, since three fields and a length check don't need one.
 */
export function useCaptureEntity({ role, parentID, parentRole }: UseCaptureEntityOptions) {
  const feedback = useAppFeedback();
  const saveMutation = useSaveProductMutation();

  // Announce the queued-offline state once per pause — not on every render —
  // so going offline mid-create doesn't leave the Create button spinning
  // forever with no explanation (the button label handles the ongoing state).
  useEffect(() => {
    if (saveMutation.isPaused) feedback.toast(QUEUED_OFFLINE_LABEL);
  }, [saveMutation.isPaused, feedback]);

  const [name, setName] = useState('');
  const [typeID, setTypeID] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [images, setImages] = useState<Product['images']>([]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length >= PRODUCT_NAME_MIN_LENGTH && !saveMutation.isPending;
  // A kept typeID after createAndAddAnother (see below) is a carried-over
  // preference, not unsaved data — it shouldn't make a freshly reset screen
  // look dirty and trigger a "Discard changes?" prompt on the way out.
  const isDirty = trimmedName.length > 0 || (images?.length ?? 0) > 0 || amount !== DEFAULT_AMOUNT;

  // Guards both entry points below against a double Create (Enter-submit +
  // click can both fire before the disabled/loading state re-renders).
  const inFlightRef = useRef(false);

  const performCreate = async (): Promise<{ id: number; partial: boolean } | undefined> => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    try {
      const draft = newProduct({ parentID, parentRole });
      // newProduct() derives role from parentID, which is undefined for a
      // malformed parent route param — pin the role the screen was actually
      // opened for so a broken /components/new URL fails loudly (component
      // create requires a parent) instead of silently POSTing a top-level product.
      draft.role = role;
      draft.name = trimmedName;
      draft.productTypeID = typeID;
      draft.images = images;
      draft.amountInParent = role === 'component' ? amount : undefined;

      try {
        // Every call here is a create (draft is always a fresh, id-less
        // product), so a key is always generated — once per Create tap,
        // reused across react-query's automatic retries and any
        // paused-mutation rehydration for this same save attempt.
        const id = await saveMutation.mutateAsync({
          product: draft,
          originalImages: [],
          originalVideos: [],
          idempotencyKey: createRequestId(),
        });
        return { id, partial: false };
      } catch (err) {
        // saveNewProduct() POSTs, assigns the returned id onto this same
        // draft object, then uploads images — so a rejection with draft.id
        // already set means the record exists and only the upload failed.
        if (typeof draft.id === 'number') {
          feedback.error('Created, but some photos failed to upload.');
          return { id: draft.id, partial: true };
        }
        feedback.error(getErrorMessage(err, 'Could not create. Please try again.'));
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
    // A partial success (record created, upload failed) already surfaced its
    // own error above. Batch mode has nothing left to batch: the record
    // exists and its photos need attention, same as a plain create — don't
    // toast success or reset the form (that would discard the local photos
    // that failed to upload). The caller routes to the detail screen instead.
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
