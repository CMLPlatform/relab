import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useDialog } from '@/components/common/DialogProvider';
import { useAuth } from '@/context/AuthProvider';
import { useDeleteProductMutation, useProductQuery, useSaveProductMutation } from '@/hooks/useProductQueries';
import { newProduct } from '@/services/api/fetching';
import { validateProduct } from '@/services/api/validation/product';
import { consumeNewProductIntent } from '@/services/newProductStore';
import { Product } from '@/types/Product';

/**
 * Manages all state and mutations for the product detail / edit form.
 * The page component is responsible only for navigation effects and rendering.
 */
export function useProductForm(id: string) {
  const router = useRouter();
  const dialog = useDialog();
  const { user } = useAuth();

  const isNew = id === 'new';
  const numericId = isNew ? ('new' as const) : parseInt(id);

  // ─── Server state ─────────────────────────────────────────────────────────────
  const { data: serverProduct, isLoading, isError, error, refetch } = useProductQuery(numericId);

  // ─── Local edit state ─────────────────────────────────────────────────────────
  const [product, setProduct] = useState<Product>(() => (isNew ? newProduct() : ({} as Product)));
  const [editMode, setEditMode] = useState(isNew);
  // True for the session immediately after a new product's first save — drives the component nudge
  const [justCreated, setJustCreated] = useState(false);

  const saveMutation = useSaveProductMutation();
  const deleteMutation = useDeleteProductMutation();

  const isProductComponent = typeof product.parentID === 'number' && !isNaN(product.parentID);
  const validationResult = validateProduct(product);

  // Seed local state when server data arrives or when creating a new product
  useEffect(() => {
    if (isNew) {
      if (!user) {
        router.replace({ pathname: '/login', params: { redirectTo: '/products' } });
        return;
      }
      const intent = consumeNewProductIntent();
      const newProd = newProduct(intent?.name, intent?.parentID ?? NaN, intent?.brand, intent?.model);
      if (intent?.isComponent && !newProd.amountInParent) {
        newProd.amountInParent = 1;
      }
      setProduct(newProd);
    } else if (serverProduct && !editMode) {
      // Only sync from server when not actively editing — avoids clobbering user input
      setProduct(serverProduct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverProduct, isNew]);

  // ─── Field change handlers ────────────────────────────────────────────────────
  const onProductNameChange = (newName: string) => setProduct((p) => ({ ...p, name: newName.trim() }));

  const onChangeDescription = (v: string) => setProduct((p) => ({ ...p, description: v }));
  const onChangePhysicalProperties = (v: typeof product.physicalProperties) =>
    setProduct((p) => ({ ...p, physicalProperties: v }));
  const onChangeCircularityProperties = (v: typeof product.circularityProperties) =>
    setProduct((p) => ({ ...p, circularityProperties: v }));
  const onBrandChange = (v: string) => setProduct((p) => ({ ...p, brand: v }));
  const onModelChange = (v: string) => setProduct((p) => ({ ...p, model: v }));
  const onTypeChange = (v: number) => setProduct((p) => ({ ...p, productTypeID: v }));
  const onImagesChange = (v: Product['images']) => setProduct((p) => ({ ...p, images: v }));
  const onAmountInParentChange = (v: number) => setProduct((p) => ({ ...p, amountInParent: v }));
  const onVideoChange = (v: Product['videos']) => setProduct((p) => ({ ...p, videos: v }));

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
