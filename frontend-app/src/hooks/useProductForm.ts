import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { type FieldPath, type FieldPathValue, useForm } from 'react-hook-form';
import { useDialog } from '@/components/common/DialogProvider';
import { useAuth } from '@/context/AuthProvider';
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
export function useProductForm(id: string) {
  const router = useRouter();
  const dialog = useDialog();
  const { user } = useAuth();

  const isNew = id === 'new';
  const numericId = isNew ? ('new' as const) : parseInt(id, 10);

  // ─── Server state ─────────────────────────────────────────────────────────────
  const { data: serverProduct, isLoading, isError, error, refetch } = useProductQuery(numericId);

  // ─── react-hook-form ──────────────────────────────────────────────────────────
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: isNew ? newProduct() : ({} as Product),
    mode: 'onChange',
  });

  const product = form.watch() as Product;

  const [editMode, setEditMode] = useState(isNew);
  // True for the session immediately after a new product's first save; drives the component nudge
  const [justCreated, setJustCreated] = useState(false);
  const hydratedDraftRef = useRef(false);
  const lastHydratedProductRef = useRef<Product | null>(null);

  const saveMutation = useSaveProductMutation();
  const deleteMutation = useDeleteProductMutation();

  const isProductComponent =
    typeof product.parentID === 'number' && !Number.isNaN(product.parentID);
  // Derive validation result from RHF's Zod resolver which validates on every change
  const validationResult = {
    isValid: form.formState.isValid,
    error: Object.values(form.formState.errors)
      .flatMap((e) => (e?.message ? [e.message] : []))[0],
  };

  // Seed form state when server data arrives or when creating a new product
  useEffect(() => {
    if (isNew) {
      if (hydratedDraftRef.current) {
        return;
      }
      if (!user) {
        router.replace({ pathname: '/login', params: { redirectTo: '/products' } });
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
      form.reset(newProd);
      hydratedDraftRef.current = true;
    } else if (serverProduct && !editMode) {
      // Only sync from server when not actively editing; avoids clobbering user input
      if (lastHydratedProductRef.current === serverProduct) {
        return;
      }
      form.reset(serverProduct);
      lastHydratedProductRef.current = serverProduct;
    }
  }, [
    serverProduct,
    isNew,
    editMode, // Only sync from server when not actively editing; avoids clobbering user input
    form.reset,
    router.replace,
    user,
  ]);

  // ─── Field change handlers ────────────────────────────────────────────────────
  const updateField = <K extends FieldPath<ProductFormValues>>(field: K) => {
    return (value: FieldPathValue<ProductFormValues, K>) =>
      form.setValue(field, value, { shouldValidate: true });
  };

  const onProductNameChange = (newName: string) =>
    form.setValue('name', newName.trim(), { shouldValidate: true });
  const onChangeDescription = updateField('description');
  const onChangePhysicalProperties = updateField('physicalProperties');
  const onChangeCircularityProperties = updateField('circularityProperties');
  const onBrandChange = updateField('brand');
  const onModelChange = updateField('model');
  const onTypeChange = updateField('productTypeID');
  const onImagesChange = updateField('images');
  const onAmountInParentChange = updateField('amountInParent');
  const onVideoChange = updateField('videos');

  // ─── Save / delete ────────────────────────────────────────────────────────────
  const toggleEditMode = () => {
    if (!editMode) {
      setEditMode(true);
      return;
    }

    // Pass server-state images/videos so saving.ts can diff without re-fetching
    const originalImages = serverProduct?.images ?? [];
    const originalVideos = serverProduct?.videos ?? [];

    saveMutation.mutate(
      { product, originalImages, originalVideos },
      {
        onSuccess: (savedId) => {
          if (isNew) {
            router.setParams({ id: savedId.toString() });
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
        router.replace('/products');
      },
    });
  };

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
    onProductNameChange,
    onChangeDescription,
    onChangePhysicalProperties,
    onChangeCircularityProperties,
    onBrandChange,
    onModelChange,
    onTypeChange,
    onImagesChange,
    onAmountInParentChange,
    onVideoChange,
    toggleEditMode,
    onProductDelete,
  };
}
