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
import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import {
  type ProductRole,
  useBaseProductQuery,
  useComponentQuery,
  useDeleteProductMutation,
  useSaveProductMutation,
} from '@/hooks/useProductQueries';
import { newProduct } from '@/services/api/products';
import { type ProductFormValues, productSchema } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';

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

function buildValidationResult(
  formState: ReturnType<typeof useForm<ProductFormValues>>['formState'],
) {
  return {
    isValid: formState.isValid,
    error: getFirstFormError(formState.errors),
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

type DraftSeed = {
  name?: string;
  brand?: string;
  model?: string;
  parentID?: number;
  parentRole?: 'product' | 'component';
};

function useProductFormHydration({
  draftSeed,
  editMode,
  isNew,
  replace,
  reset,
  serverProduct,
  user,
}: {
  draftSeed: DraftSeed;
  editMode: boolean;
  isNew: boolean;
  replace: ReturnType<typeof useRouter>['replace'];
  reset: ReturnType<typeof useForm<ProductFormValues>>['reset'];
  serverProduct: Product | undefined;
  user: ReturnType<typeof useAuth>['user'];
}) {
  const hydratedDraftRef = useRef(false);
  const lastHydratedProductRef = useRef<Product | null>(null);

  useEffect(() => {
    if (isNew) {
      if (hydratedDraftRef.current) return;
      if (!user) {
        replace({ pathname: '/login', params: { redirectTo: '/products' } });
        return;
      }
      const newProd = newProduct(draftSeed);
      if (typeof draftSeed.parentID === 'number' && !newProd.amountInParent) {
        newProd.amountInParent = 1;
      }
      reset(newProd);
      hydratedDraftRef.current = true;
      return;
    }

    if (!serverProduct || lastHydratedProductRef.current === serverProduct) return;

    // First load: always hydrate (the /edit route mounts with editMode=true but
    // still needs the server data). Refetches after that would clobber in-flight
    // edits, so skip them once a user is editing.
    const isFirstHydration = lastHydratedProductRef.current === null;
    if (editMode && !isFirstHydration) return;

    reset(serverProduct);
    lastHydratedProductRef.current = serverProduct;
  }, [serverProduct, isNew, editMode, reset, replace, user, draftSeed]);
}

function useProductFormActions({
  deleteMutation,
  dialog,
  isDirty,
  isNew,
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
  isNew: boolean;
  onSaveSuccess?: (savedId: number) => void;
  product: Product;
  replace: ReturnType<typeof useRouter>['replace'];
  reset: ReturnType<typeof useForm<ProductFormValues>>['reset'];
  saveMutation: ReturnType<typeof useSaveProductMutation>;
  serverProduct: Product | undefined;
}) {
  const saveAndExit = () => {
    // Clean form: treat as "close without writing". New drafts discard back to the
    // list; existing entities just leave edit mode via the caller's onSaveSuccess.
    if (!isDirty) {
      if (isNew) {
        replace('/products');
        return;
      }
      if (typeof product.id === 'number') onSaveSuccess?.(product.id);
      return;
    }

    saveMutation.mutate(
      {
        product,
        originalImages: serverProduct?.images ?? [],
        originalVideos: serverProduct?.videos ?? [],
      },
      {
        onSuccess: (savedId) => {
          // Clear the form's dirty state with the just-persisted values so any
          // navigation guard (beforeRemove) downstream doesn't read stale
          // "unsaved changes" and block the exit the caller is about to trigger.
          reset({ ...product, id: savedId });
          onSaveSuccess?.(savedId);
        },
        onError: (err) => {
          dialog.alert({ title: 'Save failed', message: String(err), buttons: [{ text: 'OK' }] });
        },
      },
    );
  };

  const onProductDelete = () => {
    deleteMutation.mutate(product, {
      onSuccess: () => {
        // Same rationale as save: clear the form so the unsaved-changes guard
        // on /products/[id] doesn't fire during the redirect.
        reset(product);
        replace('/products');
      },
    });
  };

  return { saveAndExit, onProductDelete };
}

export type UseProductFormOptions = {
  /** Which backend endpoint to fetch from. Required for view/edit flows. */
  role: ProductRole;
  /** Start with editMode=true (used by dedicated /edit and /new routes). */
  initialEditMode?: boolean;
  /** Called after a successful save. The /edit and /new routes use this to navigate out. */
  onSaveSuccess?: (savedId: number) => void;
  /**
   * Force new-draft mode independent of the `id` param. Used by static create
   * routes (/products/new, /products/[id]/components/new, and
   * /components/[id]/components/new) where the URL has no child id segment.
   */
  isNew?: boolean;
  /** Initial draft fields. Only consumed when the form is in new-draft mode. */
  draftSeed?: DraftSeed;
};

export function useProductForm(id: string | undefined, options: UseProductFormOptions) {
  const { replace } = useRouter();
  const dialog = useDialog();
  const { user } = useAuth();

  const isNew = options.isNew === true;
  const parsedId = parseInt(id ?? '', 10);
  const numericId = !isNew && Number.isFinite(parsedId) ? parsedId : undefined;
  const draftSeed = options.draftSeed ?? {};

  // Both hooks always run (React rule) but only the role's endpoint is enabled.
  // When isNew (or the id is missing), neither is enabled so no fetch happens.
  const isBaseRole = options.role === 'product';
  const baseQuery = useBaseProductQuery(isBaseRole ? numericId : undefined);
  const componentQuery = useComponentQuery(!isBaseRole ? numericId : undefined);
  const activeQuery = isBaseRole ? baseQuery : componentQuery;
  const { data: serverProduct, isLoading, isError, error, refetch } = activeQuery;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: isNew ? newProduct() : ({} as Product),
    mode: 'onChange',
  });
  const { reset, setValue, formState, trigger } = form;
  const { isDirty } = formState;

  const product = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  }) as Product;

  // Per-screen constant: the /edit and /new routes pass initialEditMode=true, the
  // /detail routes leave it undefined. Nothing flips this at runtime anymore.
  const editMode = isNew || options.initialEditMode === true;

  useProductFormHydration({ draftSeed, editMode, isNew, replace, reset, serverProduct, user });

  // Populate validation errors eagerly on mount so the save-FAB tooltip can
  // surface what's missing even before the user touches a field. Without this,
  // react-hook-form only runs validation on change, so a fresh /new route shows
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
    isNew,
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
    isNew,
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
