import { useState } from 'react';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { newProduct } from '@/services/api/products';
import { PRODUCT_NAME_MIN_LENGTH } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';
import { useSaveProductMutation } from './queries';

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

  const [name, setName] = useState('');
  const [typeID, setTypeID] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [images, setImages] = useState<Product['images']>([]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length >= PRODUCT_NAME_MIN_LENGTH && !saveMutation.isPending;
  const isDirty =
    trimmedName.length > 0 ||
    (images?.length ?? 0) > 0 ||
    typeID !== undefined ||
    amount !== DEFAULT_AMOUNT;

  const create = async (): Promise<number | undefined> => {
    const draft = newProduct({ parentID, parentRole });
    draft.name = trimmedName;
    draft.productTypeID = typeID;
    draft.images = images;
    draft.amountInParent = role === 'component' ? amount : undefined;

    try {
      return await saveMutation.mutateAsync({
        product: draft,
        originalImages: [],
        originalVideos: [],
      });
    } catch (err) {
      feedback.error(getErrorMessage(err, 'Could not create. Please try again.'));
      return undefined;
    }
  };

  const createAndAddAnother = async (): Promise<boolean> => {
    const savedName = trimmedName;
    const savedId = await create();
    if (savedId === undefined) return false;

    feedback.toast(`${savedName} added`);
    setName('');
    setImages([]);
    setAmount(DEFAULT_AMOUNT);
    return true;
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
    isDirty,
    create,
    createAndAddAnother,
  };
}
