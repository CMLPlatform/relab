import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { newProduct } from '@/services/api/products';
import { createRequestId } from '@/services/api/request';
import { PRODUCT_NAME_MIN_LENGTH } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';
import { QUEUED_OFFLINE_LABEL, type SaveProductVariables, useSaveProductMutation } from './queries';

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

  const queuedToastShownRef = useQueuedOfflineToast(saveMutation.isPaused, feedback);

  const { resetForNextDraft, isStaleDraft, ...fields } = useCaptureFields();
  const { name, typeID, amount, images } = fields;

  // Not saveMutation.isPending: a create queued offline stays pending while the next draft is captured.
  const [isCreating, setIsCreating] = useState(false);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length >= PRODUCT_NAME_MIN_LENGTH && !isCreating;
  // A typeID kept by createAndAddAnother is a preference, not unsaved data.
  const isDirty = trimmedName.length > 0 || (images?.length ?? 0) > 0 || amount !== DEFAULT_AMOUNT;

  // Guards both entry points below against a double Create (Enter-submit +
  // click can both fire before the disabled/loading state re-renders).
  const inFlightRef = useRef(false);

  // One key per draft, not per Create tap: see useProductForm's saveAndExit.
  const idempotencyKeyRef = useRef<string | null>(null);

  const buildDraft = (): SaveProductVariables => {
    // Held across retries, rehydration and manual re-taps until one lands.
    idempotencyKeyRef.current ??= createRequestId();
    return {
      product: draftProduct({ role, parentID, parentRole }, trimmedName, typeID, images, amount),
      originalImages: [],
      originalVideos: [],
      idempotencyKey: idempotencyKeyRef.current,
    };
  };

  const performCreate = async (): Promise<{ id: number; partial: boolean } | undefined> => {
    if (inFlightRef.current || isStaleDraft()) return undefined;
    inFlightRef.current = true;
    setIsCreating(true);
    try {
      const variables = buildDraft();
      const draft = variables.product;
      try {
        const id = await saveMutation.mutateAsync(variables);
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
      setIsCreating(false);
    }
  };

  // Offline at the bench: queue this draft (photos and Idempotency-Key ride in
  // the paused mutation; the save scope sends queued creates in order) and hand
  // back an empty form. The outcome is reported even after this screen has gone.
  const queueAndContinue = (savedName: string): boolean => {
    if (isStaleDraft()) return false;
    const variables = buildDraft();
    // The key now belongs to the queued draft; the next draft mints its own.
    idempotencyKeyRef.current = null;
    const created = saveMutation.mutateAsync(variables);
    queuedToastShownRef.current = true;
    void reportQueuedCreate(feedback, savedName, variables.product, created);
    resetForNextDraft();
    return true;
  };

  const create = async (): Promise<number | undefined> => {
    const result = await performCreate();
    return result?.id;
  };

  const createAndAddAnother = async (): Promise<
    { id: number; partial: boolean } | 'queued' | undefined
  > => {
    const savedName = trimmedName;
    if (!onlineManager.isOnline() && !inFlightRef.current) {
      return queueAndContinue(savedName) ? 'queued' : undefined;
    }
    const result = await performCreate();
    // Partial success (record created, upload failed): do not toast success
    // or reset the form, which would discard the photos that failed.
    if (result === undefined || result.partial) return result;

    feedback.toast(`${savedName} added`);
    resetForNextDraft();
    return result;
  };

  return {
    ...fields,
    canCreate,
    isCreating,
    isPaused: saveMutation.isPaused,
    isDirty,
    create,
    createAndAddAnother,
  };
}

/** The draft's fields. "Add another" keeps typeID: the next part is usually the same kind. */
function useCaptureFields() {
  const [name, setName] = useState('');
  const [typeID, setTypeID] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [images, setImages] = useState<Product['images']>([]);
  // Bumped on every reset. A handler from a render before the reset still sees
  // the sent draft's fields (an Enter and a click in one frame), so it must not
  // send them again under a fresh Idempotency-Key.
  const draftGenRef = useRef(0);
  const renderedGen = draftGenRef.current;
  const isStaleDraft = () => renderedGen !== draftGenRef.current;
  const resetForNextDraft = () => {
    draftGenRef.current += 1;
    setName('');
    setImages([]);
    setAmount(DEFAULT_AMOUNT);
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
    resetForNextDraft,
    isStaleDraft,
  };
}

/** Announces the queued-offline state once per pause, unless the caller already named the item. */
function useQueuedOfflineToast(isPaused: boolean, feedback: ReturnType<typeof useAppFeedback>) {
  // Set when createAndAddAnother already named the queued item in its own toast.
  const shownRef = useRef(false);
  useEffect(() => {
    if (!isPaused) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    feedback.toast(QUEUED_OFFLINE_LABEL);
  }, [isPaused, feedback]);
  return shownRef;
}

function draftProduct(
  { role, parentID, parentRole }: UseCaptureEntityOptions,
  name: string,
  typeID: number | undefined,
  images: Product['images'],
  amount: number,
): Product {
  const draft = newProduct({ parentID, parentRole });
  // Pin the role: newProduct() derives it from parentID, and a malformed
  // /components/new URL would otherwise POST a top-level product.
  draft.role = role;
  draft.name = name;
  draft.productTypeID = typeID;
  draft.images = images;
  draft.amountInParent = role === 'component' ? amount : undefined;
  return draft;
}

/** A queued create settles with no screen awaiting it: say what happened to which item. */
async function reportQueuedCreate(
  feedback: ReturnType<typeof useAppFeedback>,
  name: string,
  draft: Product,
  created: Promise<number>,
) {
  feedback.toast(`${name} queued — sends when online`);
  try {
    await created;
  } catch (err) {
    // saveNewProduct() sets draft.id once the POST lands; a later rejection
    // means only the photo upload failed.
    if (typeof draft.id === 'number') {
      feedback.error(
        `"${name}" was created, but some photos failed to upload. Open it to add them again.`,
        'Upload failed',
      );
      return;
    }
    feedback.error(
      `"${name}" was not created. ${getErrorMessage(err, 'Please capture it again.')}`,
      'Create failed',
    );
    return;
  }
  feedback.toast(`${name} added`);
}
