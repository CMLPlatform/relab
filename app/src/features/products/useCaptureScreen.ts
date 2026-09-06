import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { baseProductQueryOptions, componentQueryOptions } from '@/features/product-entity/queries';
import { newProduct } from '@/services/api/products';
import { type UseCaptureEntityOptions, useCaptureEntity } from './useCaptureEntity';

/** Capture screen logic: draft state, guest redirect, parent lookup, unsaved-changes guard, post-create routing. */
export function useCaptureScreen({ role, parentID, parentRole }: UseCaptureEntityOptions) {
  const router = useRouter();
  const navigation = useNavigation();
  const dialog = useDialog();
  const { user } = useAuth();

  // Creation needs an account.
  useEffect(() => {
    if (!user) router.replace({ pathname: '/login', params: { redirectTo: '/products' } });
  }, [user, router]);

  const entity = useCaptureEntity({ role, parentID, parentRole });
  const { images, isDirty, create, createAndAddAnother } = entity;

  const draftProduct = useMemo(
    () => ({ ...newProduct({ parentID, parentRole }), images }),
    [parentID, parentRole, images],
  );

  // The two queryOptions() types do not unify behind one useQuery; run both,
  // each `enabled` only for its role.
  const isComponentParent = parentRole === 'component';
  const baseParentQuery = useQuery(
    baseProductQueryOptions(isComponentParent ? undefined : parentID),
  );
  const componentParentQuery = useQuery(
    componentQueryOptions(isComponentParent ? parentID : undefined),
  );
  const parentName = (isComponentParent ? componentParentQuery : baseParentQuery).data?.name;

  // The form is still "dirty" for one render after a create; skip the beforeRemove guard.
  const skipNextBeforeRemoveRef = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (skipNextBeforeRemoveRef.current) {
        skipNextBeforeRemoveRef.current = false;
        return;
      }
      if (!isDirty) return;
      event.preventDefault();
      dialog.alert({
        title: 'Discard changes?',
        message:
          'You have unsaved changes. Are you sure you want to discard them and leave the screen?',
        buttons: [
          { text: "Don't leave" },
          {
            text: 'Discard',
            onPress: () => {
              skipNextBeforeRemoveRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ],
      });
    });
  }, [navigation, dialog, isDirty]);

  const goToSaved = (id: number) => {
    skipNextBeforeRemoveRef.current = true;
    router.replace({
      pathname: role === 'component' ? '/components/[id]' : '/products/[id]',
      params: { id: String(id), edit: '1' },
    });
  };

  const handleCreate = async () => {
    const savedId = await create();
    if (savedId === undefined) return;
    goToSaved(savedId);
  };

  // Returns whether the screen stayed put with a freshly reset form.
  const handleCreateAndAddAnother = async (): Promise<boolean> => {
    const result = await createAndAddAnother();
    if (result === undefined) return false;
    // Partial success: route to the detail screen like a plain Create.
    if (result.partial) {
      goToSaved(result.id);
      return false;
    }
    return true;
  };

  return { ...entity, draftProduct, parentName, handleCreate, handleCreateAndAddAnother };
}
