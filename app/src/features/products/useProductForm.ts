import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
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
import { MediaSyncError } from '@/services/api/saving';
import { type ProductFormValues, productSchema } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';
import {
  type ProductRole,
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

// Maps top-level form fields to the spec-sheet section that displays them, so an
// invalid field can be scrolled to. Declaration order is on-screen order:
// firstErrorSection walks it, so it lands on the visually first invalid field
// rather than whichever one react-hook-form happened to register first. Fields
// not listed here (e.g. componentIDs) never yield a section.
const FIELD_SECTION: Record<string, SectionKey> = {
  name: 'overview',
  description: 'overview',
  brand: 'overview',
  model: 'overview',
  amountInParent: 'overview',
  productTypeID: 'overview',
  physicalProperties: 'physical',
  circularityProperties: 'circularity',
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

function useProductFieldHandlers(
  setValue: ReturnType<typeof useForm<ProductFormValues>>['setValue'],
) {
  const updateField = <K extends FieldPath<ProductFormValues>>(field: K) => {
    return (value: FieldPathValue<ProductFormValues, K>) =>
      setValue(field, value, { shouldValidate: true, shouldDirty: true });
  };

  return {
    onProductNameChange: (newName: string) =>
      setValue('name', newName.trim(), { shouldValidate: true, shouldDirty: true }),
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

    // First load: always hydrate (the /edit route mounts with editMode=true but
    // still needs the server data). Refetches after that would clobber in-flight
    // edits, so skip them once a user is editing.
    const isFirstHydration = lastHydratedProductRef.current === null;
    if (editMode && !isFirstHydration) return;

    reset(serverProduct);
    lastHydratedProductRef.current = serverProduct;
  }, [serverProduct, editMode, reset]);
}

function useProductFormActions({
  deleteMutation,
  dialog,
  isDirty,
  onDeleteSuccess,
  onSaveSuccess,
  product,
  replace,
  reset,
  saveMutation,
  serverProduct,
}: {
  deleteMutation: ReturnType<typeof useDeleteProductMutation>;
  dialog: ReturnType<typeof useDialog>;
  isDirty: boolean;
  onDeleteSuccess?: () => void;
  onSaveSuccess?: (savedId: number) => void;
  product: Product;
  replace: ReturnType<typeof useRouter>['replace'];
  reset: ReturnType<typeof useForm<ProductFormValues>>['reset'];
  saveMutation: ReturnType<typeof useSaveProductMutation>;
  serverProduct: Product | undefined;
}) {
  const saveAndExit = useSingleFlight(async () => {
    // Clean form: treat as "close without writing", leaving edit mode via the
    // caller's onSaveSuccess.
    if (!isDirty) {
      if (typeof product.id === 'number') onSaveSuccess?.(product.id);
      return;
    }

    try {
      const savedId = await saveMutation.mutateAsync({
        product,
        originalImages: serverProduct?.images ?? [],
        originalVideos: serverProduct?.videos ?? [],
      });
      // Clear the form's dirty state with the just-persisted values so any
      // navigation guard (beforeRemove) downstream doesn't read stale
      // "unsaved changes" and block the exit the caller is about to trigger.
      reset({ ...product, id: savedId });
      onSaveSuccess?.(savedId);
    } catch (err) {
      // A media-sync failure means the entity itself saved — say so, and stay
      // put so the photos that didn't upload are still there to retry.
      const partial = err instanceof MediaSyncError;
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
      // Same rationale as save: clear the form so the unsaved-changes guard
      // on /products/[id] doesn't fire during the redirect.
      reset(product);
      // Let the screen own where a delete lands (a component returns to its
      // parent, not the root list) and skip the beforeRemove guard, mirroring
      // onSaveSuccess. Fall back to the root list for callers without a wrapper.
      if (onDeleteSuccess) {
        onDeleteSuccess();
      } else {
        replace('/products');
      }
    } catch (err) {
      // Without this a failed delete is swallowed by react-query — the entity
      // stays on screen with no feedback, so the tap looks like it did nothing.
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

  // Both hooks always run (React rule) but only the role's endpoint is enabled.
  // When the id is missing, neither is enabled so no fetch happens.
  const isBaseRole = options.role === 'product';
  const baseQuery = useBaseProductQuery(isBaseRole ? numericId : undefined);
  const componentQuery = useComponentQuery(!isBaseRole ? numericId : undefined);
  const activeQuery = isBaseRole ? baseQuery : componentQuery;
  const { data: serverProduct, isLoading, isError, error, refetch } = activeQuery;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    // A valid empty product as the loading sentinel until the query resolves
    // and the hydration effect resets to server data; without it `product`
    // would be a malformed `{}` and consumers (name, role, media) would read
    // undefined.
    defaultValues: newProduct(),
    mode: 'onChange',
  });
  const { reset, setValue, formState, trigger } = form;
  const { isDirty } = formState;

  const product = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  }) as Product;

  // Per-screen constant: EntityDetailPage passes initialEditMode=true when the
  // URL carries ?edit=1, undefined otherwise. Nothing flips this at runtime.
  const editMode = options.initialEditMode === true;

  useProductFormHydration({ editMode, reset, serverProduct });

  // Populate validation errors eagerly on mount so the save-FAB tooltip can
  // surface what's missing even before the user touches a field. Without this,
  // react-hook-form only runs validation on change, so entering edit mode shows
  // a disabled FAB with no hint why.
  useEffect(() => {
    if (editMode) trigger().catch(() => {});
  }, [editMode, trigger]);

  const saveMutation = useSaveProductMutation();
  const deleteMutation = useDeleteProductMutation();
  const fieldHandlers = useProductFieldHandlers(setValue);
  const { saveAndExit, onProductDelete } = useProductFormActions({
    deleteMutation,
    dialog,
    isDirty,
    onDeleteSuccess: options.onDeleteSuccess,
    onSaveSuccess: options.onSaveSuccess,
    product,
    replace,
    reset,
    saveMutation,
    serverProduct,
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
    justSaved: saveMutation.isSuccess,
    ...fieldHandlers,
    saveAndExit,
    onProductDelete,
  };
}
