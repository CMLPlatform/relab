import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  type FieldErrors,
  type FieldPath,
  type FieldPathValue,
  useForm,
  useWatch,
} from 'react-hook-form';

/** Recursively extract the first error message from possibly nested FieldErrors. */
function getFirstFormError(errors: FieldErrors): string | undefined {
  for (const value of Object.values(errors)) {
    if (!value) continue;
    if (typeof value.message === 'string' && value.message) return value.message;
    // Nested object errors (e.g. physicalProperties.weight)
    if (typeof value === 'object') {
      const nested = getFirstFormError(value as FieldErrors);
      if (nested) return nested;
    }
  }
  return;
}

import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import {
  useDeleteProductMutation,
  useProductQuery,
  useSaveProductMutation,
} from '@/hooks/useProductQueries';
import { newProduct } from '@/services/api/products';
import { type ProductFormValues, productSchema } from '@/services/api/validation/productSchema';
import { consumeNewProductIntent } from '@/services/newProductStore';
import type { Product } from '@/types/Product';

/**
 * Manages all state and mutations for the product detail / edit form.
 * Uses react-hook-form with zod validation internally, while keeping the same
 * external interface so child components don't need changes.
 */
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
      setValue(field, value, { shouldValidate: true });
  };

  return {
    onProductNameChange: (newName: string) =>
      setValue('name', newName.trim(), { shouldValidate: true }),
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
  isNew,
  replace,
  reset,
  serverProduct,
  user,
}: {
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
      if (hydratedDraftRef.current) {
        return;
      }
      if (!user) {
        replace({ pathname: '/login', params: { redirectTo: '/products' } });
        return;
      }
      const intent = consumeNewProductIntent();
      const newProd = newProduct(
        intent?.name,
        intent?.parentID ?? NaN,
        intent?.brand,
        intent?.model,
      );
      if (intent?.isComponent && !newProd.amountInParent) {
        newProd.amountInParent = 1;
      }
      reset(newProd);
      hydratedDraftRef.current = true;
      return;
    }

    if (!serverProduct || editMode || lastHydratedProductRef.current === serverProduct) {
      return;
    }

    // Only sync from server when not actively editing; avoids clobbering user input.
    reset(serverProduct);
    lastHydratedProductRef.current = serverProduct;
  }, [serverProduct, isNew, editMode, reset, replace, user]);
}

function useProductFormActions({
  deleteMutation,
  dialog,
  editMode,
  isNew,
  product,
  replace,
  saveMutation,
  serverProduct,
  setEditMode,
  setJustCreated,
  setParams,
}: {
  deleteMutation: ReturnType<typeof useDeleteProductMutation>;
  dialog: ReturnType<typeof useDialog>;
  editMode: boolean;
  isNew: boolean;
  product: Product;
  replace: ReturnType<typeof useRouter>['replace'];
  saveMutation: ReturnType<typeof useSaveProductMutation>;
  serverProduct: Product | undefined;
  setEditMode: (value: boolean) => void;
  setJustCreated: (value: boolean) => void;
  setParams: ReturnType<typeof useRouter>['setParams'];
}) {
  const toggleEditMode = () => {
    if (!editMode) {
      setEditMode(true);
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
          if (isNew) {
            setParams({ id: savedId.toString() });
            setJustCreated(true);
          }
          setEditMode(false);
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
        setEditMode(false);
        replace('/products');
      },
    });
  };

  return { toggleEditMode, onProductDelete };
}

export function useProductForm(id: string) {
  const { replace, setParams } = useRouter();
  const dialog = useDialog();
  const { user } = useAuth();

  const isNew = id === 'new';
  const numericId = isNew ? ('new' as const) : parseInt(id, 10);
  const { data: serverProduct, isLoading, isError, error, refetch } = useProductQuery(numericId);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: isNew ? newProduct() : ({} as Product),
    mode: 'onChange',
  });
  const { reset, setValue, formState } = form;

  const product = useWatch({
    control: form.control,
    defaultValue: form.getValues(),
  }) as Product;

  const [editMode, setEditMode] = useState(isNew);
  const [justCreated, setJustCreated] = useState(false);

  useProductFormHydration({ editMode, isNew, replace, reset, serverProduct, user });

  const saveMutation = useSaveProductMutation();
  const deleteMutation = useDeleteProductMutation();
  const fieldHandlers = useProductFieldHandlers(setValue);
  const { toggleEditMode, onProductDelete } = useProductFormActions({
    deleteMutation,
    dialog,
    editMode,
    isNew,
    product,
    replace,
    saveMutation,
    serverProduct,
    setEditMode,
    setJustCreated,
    setParams,
  });

  const isProductComponent =
    typeof product.parentID === 'number' && !Number.isNaN(product.parentID);
  const validationResult = buildValidationResult(formState);

  return {
    product,
    editMode,
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
    justCreated,
    ...fieldHandlers,
    toggleEditMode,
    onProductDelete,
  };
}
