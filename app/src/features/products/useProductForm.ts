import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { type RefObject, useEffect, useRef } from 'react';
import {
  type FieldErrors,
  type FieldPath,
  type FieldPathValue,
  useForm,
  useWatch,
} from 'react-hook-form';
import { useDialog } from '@/components/base/dialogContext';
import type { SectionKey } from '@/components/base/SectionNavContext';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { newProduct } from '@/services/api/products';
import { createRequestId } from '@/services/api/request';
import { MediaSyncError } from '@/services/api/saving';
import { type ProductFormValues, productSchema } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';
import type { AmountDraftFlush } from './amountDraftFlush';
import {
  type ProductRole,
  QUEUED_OFFLINE_LABEL,
  useBaseProductQuery,
  useComponentQuery,
  useDeleteProductMutation,
  useSaveProductMutation,
} from './queries';

/** Recursively extract the first error message from possibly nested FieldErrors. */
function getFirstFormError(errors: FieldErrors): string | undefined {
  for (const value of Object.values(errors)) {
    if (!value) continue;
    if (typeof value.message === 'string' && value.message) return value.message;
    if (typeof value === 'object') {
      const nested = getFirstFormError(value as FieldErrors);
      if (nested) return nested;
    }
  }
  return;
}

// Field -> section that displays it, so an invalid field can be scrolled to.
// Declaration order is on-screen order; firstErrorSection walks it in order.
const FIELD_SECTION: Record<string, SectionKey> = {
  name: 'overview',
  description: 'overview',
  brand: 'overview',
  model: 'overview',
  amountInParent: 'overview',
  productTypeID: 'overview',
  physicalProperties: 'properties',
  circularityProperties: 'properties',
  videos: 'media',
  images: 'media',
};

function buildValidationResult(
  formState: ReturnType<typeof useForm<ProductFormValues>>['formState'],
) {
  const { errors } = formState;
  const firstErrorField = Object.keys(FIELD_SECTION).find((field) => field in errors);
  return {
    isValid: formState.isValid,
    error: getFirstFormError(errors),
    errorCount: Object.keys(errors).length,
    firstErrorSection: firstErrorField ? FIELD_SECTION[firstErrorField] : undefined,
  };
}

// Text and number fields save on blur in edit mode. Image uploads and videos
// stay on the explicit Save button (uploads are heavy and diffed there); the
// type picker rides along in the next blur-save or the explicit Save.
const BLUR_SAVE_FIELDS = new Set<FieldPath<ProductFormValues>>([
  'name',
  'description',
  'brand',
  'model',
  'amountInParent',
  'physicalProperties',
  'circularityProperties',
]);

function useProductFieldHandlers({
  form,
  editMode,
  saveMutation,
  serverProduct,
  dialog,
}: {
  form: ReturnType<typeof useForm<ProductFormValues>>;
  editMode: boolean;
  saveMutation: ReturnType<typeof useSaveProductMutation>;
  serverProduct: Product | undefined;
  dialog: ReturnType<typeof useDialog>;
}) {
  const { setValue, getValues, trigger, reset, formState } = form;

  /** Commit a field, then PATCH the record if the field changed and the form validates. */
  const commit = async <K extends FieldPath<ProductFormValues>>(
    field: K,
    value: FieldPathValue<ProductFormValues, K>,
  ) => {
    const previous = getValues(field);
    setValue(field, value, { shouldValidate: true, shouldDirty: true });
    if (!editMode || !BLUR_SAVE_FIELDS.has(field) || !serverProduct) return;
    if (typeof getValues('id') !== 'number') return;
    // Unchanged (JSON: the values are plain strings, numbers or flat objects).
    if (JSON.stringify(previous ?? null) === JSON.stringify(value ?? null)) return;
    // An invalid form is shown by the field, never sent; the explicit Save
    // button reports it as "N fields need attention".
    if (!(await trigger())) return;

    // Media is never part of a blur-save: same images/videos on both sides of
    // the diff, so only the entity PATCH goes out.
    const images = serverProduct.images ?? [];
    const videos = serverProduct.videos ?? [];
    const snapshot = { ...getValues(), images, videos } as Product;
    try {
      await saveMutation.mutateAsync({
        product: snapshot,
        originalImages: images,
        originalVideos: videos,
      });
      // Everything in the PATCH is now the server state; pending media keeps
      // its dirty state so the explicit Save still uploads it.
      const defaults = formState.defaultValues ?? {};
      reset(
        { ...snapshot, images: defaults.images, videos: defaults.videos } as ProductFormValues,
        { keepValues: true, keepErrors: true, keepIsValid: true },
      );
    } catch (err) {
      dialog.toast(getErrorMessage(err, 'Could not save. Press Save to try again.'));
    }
  };

  const updateField = <K extends FieldPath<ProductFormValues>>(field: K) => {
    return (value: FieldPathValue<ProductFormValues, K>) => void commit(field, value);
  };

  return {
    onProductNameChange: (newName: string) => void commit('name', newName.trim()),
    onChangeDescription: updateField('description'),
    onChangePhysicalProperties: updateField('physicalProperties'),
    onChangeCircularityProperties: updateField('circularityProperties'),
    onBrandChange: updateField('brand'),
    onModelChange: updateField('model'),
    onTypeChange: updateField('productTypeID'),
    onImagesChange: updateField('images'),
    onAmountInParentChange: updateField('amountInParent'),
    onVideoChange: updateField('videos'),
  };
}

function useProductFormHydration({
  editMode,
  reset,
  serverProduct,
}: {
  editMode: boolean;
  reset: ReturnType<typeof useForm<ProductFormValues>>['reset'];
  serverProduct: Product | undefined;
}) {
  const lastHydratedProductRef = useRef<Product | null>(null);

  useEffect(() => {
    if (!serverProduct || lastHydratedProductRef.current === serverProduct) return;

    // Always hydrate on first load (the /edit route mounts with editMode=true);
    // later refetches would clobber in-flight edits.
    const isFirstHydration = lastHydratedProductRef.current === null;
    if (editMode && !isFirstHydration) return;

    reset(serverProduct);
    lastHydratedProductRef.current = serverProduct;
  }, [serverProduct, editMode, reset]);
}

function useProductFormActions({
  amountFlushRef,
  deleteMutation,
  dialog,
  idempotencyKeyRef,
  isDirty,
  onDeleteSuccess,
  onSaveSuccess,
  product,
  replace,
  reset,
  saveMutation,
  serverProduct,
  setValue,
}: {
  amountFlushRef: RefObject<AmountDraftFlush | null>;
  deleteMutation: ReturnType<typeof useDeleteProductMutation>;
  dialog: ReturnType<typeof useDialog>;
  idempotencyKeyRef: RefObject<string | null>;
  isDirty: boolean;
  onDeleteSuccess?: () => void;
  onSaveSuccess?: (savedId: number) => void;
  product: Product;
  replace: ReturnType<typeof useRouter>['replace'];
  reset: ReturnType<typeof useForm<ProductFormValues>>['reset'];
  saveMutation: ReturnType<typeof useSaveProductMutation>;
  serverProduct: Product | undefined;
  setValue: ReturnType<typeof useForm<ProductFormValues>>['setValue'];
}) {
  const saveAndExit = useSingleFlight(async () => {
    // Save can fire before AmountChip's input blurs (see amountDraftFlush.ts).
    const flushedAmount = amountFlushRef.current?.();
    const currentProduct =
      flushedAmount !== undefined ? { ...product, amountInParent: flushedAmount } : product;
    // `isDirty` is last render's snapshot; a synchronous flush has not reached it.
    const effectiveIsDirty = isDirty || flushedAmount !== undefined;

    // Clean form: close without writing.
    if (!effectiveIsDirty) {
      if (typeof currentProduct.id === 'number') onSaveSuccess?.(currentProduct.id);
      return;
    }

    try {
      // One Idempotency-Key per draft, not per attempt: a second press of Save
      // after a lost response must replay, not create a second record.
      const isCreate = typeof currentProduct.id !== 'number';
      if (isCreate && idempotencyKeyRef.current === null) {
        idempotencyKeyRef.current = createRequestId();
      }
      const idempotencyKey = isCreate ? (idempotencyKeyRef.current ?? undefined) : undefined;
      const savedId = await saveMutation.mutateAsync({
        product: currentProduct,
        originalImages: serverProduct?.images ?? [],
        originalVideos: serverProduct?.videos ?? [],
        idempotencyKey,
      });
      // Reset so the beforeRemove guard does not block the exit; release the
      // key so a later draft on this screen does not reuse it.
      idempotencyKeyRef.current = null;
      reset({ ...currentProduct, id: savedId });
      onSaveSuccess?.(savedId);
    } catch (err) {
      // A media-sync failure means the entity saved; stay put so the photos
      // can be retried.
      const partial = err instanceof MediaSyncError;
      // Thread the new id into the live form so a manual retry PATCHes
      // instead of POSTing again.
      if (err instanceof MediaSyncError) {
        setValue('id', err.productId, { shouldDirty: false });
        idempotencyKeyRef.current = null;
      }
      dialog.alert({
        title: partial ? 'Photos not uploaded' : 'Save failed',
        message: getErrorMessage(err, 'Could not save. Please try again.'),
        buttons: [{ text: 'OK' }],
      });
    }
  });

  const onProductDelete = useSingleFlight(async () => {
    try {
      await deleteMutation.mutateAsync(product);
      // Reset so the unsaved-changes guard does not fire during the redirect.
      reset(product);
      // The screen owns where a delete lands (a component returns to its parent).
      if (onDeleteSuccess) {
        onDeleteSuccess();
      } else {
        replace('/products');
      }
    } catch (err) {
      // Otherwise react-query swallows the failure with no feedback.
      dialog.alert({
        title: 'Delete failed',
        message: getErrorMessage(err, 'Could not delete. Please try again.'),
        buttons: [{ text: 'OK' }],
      });
    }
  });

  return { saveAndExit, onProductDelete };
}

export type UseProductFormOptions = {
  /** Which backend endpoint to fetch from. Required for view/edit flows. */
  role: ProductRole;
  /** Start with editMode=true (used by the dedicated /edit route). */
  initialEditMode?: boolean;
  /** Called after a successful save. The /edit route uses this to navigate out. */
  onSaveSuccess?: (savedId: number) => void;
  /** Called after a successful delete. The detail screen uses this to navigate back to the parent. */
  onDeleteSuccess?: () => void;
};

export function useProductForm(id: string | undefined, options: UseProductFormOptions) {
  const { replace } = useRouter();
  const dialog = useDialog();

  const parsedId = parseInt(id ?? '', 10);
  const numericId = Number.isFinite(parsedId) ? parsedId : undefined;

  // Only the role's endpoint is enabled; with no id, neither is.
  const isBaseRole = options.role === 'product';
  const baseQuery = useBaseProductQuery(isBaseRole ? numericId : undefined);
  const componentQuery = useComponentQuery(!isBaseRole ? numericId : undefined);
  const activeQuery = isBaseRole ? baseQuery : componentQuery;
  const { data: serverProduct, isLoading, isError, error, refetch } = activeQuery;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    // Loading sentinel until hydration resets to server data; otherwise
    // `product` is a malformed `{}`.
    defaultValues: newProduct(),
    mode: 'onChange',
  });
  const { reset, setValue, formState, trigger } = form;
  const { isDirty } = formState;

  const product = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  }) as Product;

  // Per-screen constant (?edit=1); nothing flips it at runtime.
  const editMode = options.initialEditMode === true;

  useProductFormHydration({ editMode, reset, serverProduct });

  // Validate eagerly so the save-FAB tooltip can say what is missing before
  // the user touches a field.
  useEffect(() => {
    if (editMode) trigger().catch(() => {});
  }, [editMode, trigger]);

  const saveMutation = useSaveProductMutation();
  const deleteMutation = useDeleteProductMutation();

  // Announce the queued-offline state once per pause.
  useEffect(() => {
    if (saveMutation.isPaused) dialog.toast(QUEUED_OFFLINE_LABEL);
  }, [saveMutation.isPaused, dialog]);

  // AmountChip registers its pending-draft flush here (see amountDraftFlush.ts).
  const amountFlushRef = useRef<AmountDraftFlush | null>(null);

  // Lives for the draft's lifetime; minted in saveAndExit.
  const idempotencyKeyRef = useRef<string | null>(null);

  const fieldHandlers = useProductFieldHandlers({
    form,
    editMode,
    saveMutation,
    serverProduct,
    dialog,
  });
  const { saveAndExit, onProductDelete } = useProductFormActions({
    amountFlushRef,
    deleteMutation,
    dialog,
    idempotencyKeyRef,
    isDirty,
    onDeleteSuccess: options.onDeleteSuccess,
    onSaveSuccess: options.onSaveSuccess,
    product,
    replace,
    reset,
    saveMutation,
    serverProduct,
    setValue,
  });

  const isProductComponent = product.role === 'component';
  const validationResult = buildValidationResult(formState);

  return {
    product,
    editMode,
    isDirty,
    serverProduct,
    isProductComponent,
    validationResult,
    isLoading,
    isError,
    error,
    refetch,
    isSaving: saveMutation.isPending,
    isPaused: saveMutation.isPaused,
    justSaved: saveMutation.isSuccess,
    ...fieldHandlers,
    saveAndExit,
    onProductDelete,
    amountFlushRef,
  };
}
