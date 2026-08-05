import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { baseProductQueryOptions, componentQueryOptions } from '@/features/product-entity/queries';
import { newProduct } from '@/services/api/products';
import { type UseCaptureEntityOptions, useCaptureEntity } from './useCaptureEntity';

/**
 * Everything the capture-first creation screen does besides render:
 * `useCaptureEntity`'s draft state plus the guest redirect, the parent lookup,
 * the unsaved-changes guard and the post-create routing.
 */
export function useCaptureScreen({ role, parentID, parentRole }: UseCaptureEntityOptions) {
  const router = useRouter();
  const navigation = useNavigation();
  const dialog = useDialog();
  const { user } = useAuth();

  // Creation needs an account; mirror the old isNew hydration's guest redirect
  // so a logged-out user doesn't fill the form only to hit a dead Create.
  useEffect(() => {
    if (!user) router.replace({ pathname: '/login', params: { redirectTo: '/products' } });
  }, [user, router]);

  const entity = useCaptureEntity({ role, parentID, parentRole });
  const { images, isDirty, create, createAndAddAnother } = entity;

  const draftProduct = useMemo(
    () => ({ ...newProduct({ parentID, parentRole }), images }),
    [parentID, parentRole, images],
  );

  // Two distinct queryOptions() calls return incompatible generic instantiations
  // (different literal queryKey tuples), so TS can't unify them behind a single
  // ternary-fed useQuery call. Run both — each is `enabled` only for its own
  // role, so only one ever fetches — and read from whichever applies.
  const isComponentParent = parentRole === 'component';
  const baseParentQuery = useQuery(
    baseProductQueryOptions(isComponentParent ? undefined : parentID),
  );
  const componentParentQuery = useQuery(
    componentQueryOptions(isComponentParent ? parentID : undefined),
  );
  const parentName = (isComponentParent ? componentParentQuery : baseParentQuery).data?.name;

  // Skips the beforeRemove guard right after a successful create/leave — the
  // form is still "dirty" for one more render at that point, and the guard
  // would otherwise block the navigation this screen just requested.
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

  const handleCreateAndAddAnother = async () => {
    const result = await createAndAddAnother();
    // Batch mode has nothing left to batch on a partial success: the record
    // exists and its photos need attention, so route to the detail screen
    // exactly like a plain Create instead of staying on the capture form.
    if (!result?.partial) return;
    goToSaved(result.id);
  };

  return { ...entity, draftProduct, parentName, handleCreate, handleCreateAndAddAnother };
}
