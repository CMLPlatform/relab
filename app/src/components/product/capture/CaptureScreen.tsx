import { useQuery } from '@tanstack/react-query';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AmountStepper } from '@/components/base/AmountStepper';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { useDialog } from '@/components/base/dialogContext';
import { PageContainer } from '@/components/base/PageContainer';
import { Input } from '@/components/base/ui/input';
import CPVCard from '@/components/product/CPVCard';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { useAuth } from '@/context/auth';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { baseProductQueryOptions, componentQueryOptions } from '@/features/products/queries';
import { useCaptureEntity } from '@/features/products/useCaptureEntity';
import { newProduct } from '@/services/api/products';
import { PRODUCT_NAME_MAX_LENGTH } from '@/services/api/validation/productSchema';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';

type CaptureScreenProps = {
  // Named entityRole, not role: a JSX prop literally called `role` trips
  // lint/a11y/useValidAriaRole at every call site and is a live RN-Web prop
  // that would leak onto the DOM as an invalid ARIA role.
  entityRole: 'product' | 'component';
  parentID?: number;
  parentRole?: 'product' | 'component';
};

/**
 * Type-or-material row: same round-trip pattern as ProductType.tsx (pending
 * selection slot + loadCPV lookup), but driven by a plain typeID/onChange pair
 * instead of a saved product, since a capture draft has no [id] route.
 */
function CaptureTypeRow({
  typeID,
  onTypeChange,
}: {
  typeID: number | undefined;
  onTypeChange: (typeID: number) => void;
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CPVCategory | null>(null);

  useFocusEffect(
    useCallback(() => {
      const pendingTypeId = takePendingTypeSelection();
      if (pendingTypeId !== null) onTypeChange(pendingTypeId);
    }, [onTypeChange]),
  );

  useEffect(() => {
    let isMounted = true;
    loadCPV()
      .then((cpv) => {
        if (!isMounted) return;
        setSelectedType(cpv[String(typeID ?? 'root')] ?? cpv.root);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [typeID]);

  return (
    <View>
      <AppText variant="label" className="uppercase opacity-60">
        Type or material
      </AppText>
      {typeID === undefined ? (
        <AppButton
          variant="outline"
          className="w-full"
          accessibilityLabel="Choose a type or material"
          onPress={() => router.push('/category-selection')}
        >
          Choose a type or material
        </AppButton>
      ) : selectedType ? (
        <CPVCard CPV={selectedType} onPress={() => router.push('/category-selection')} />
      ) : null}
    </View>
  );
}

/**
 * Capture-first creation screen shared by the product and component "new"
 * routes: a photo strip, a name, an optional type, and (for components) a
 * parent amount — no long form, no isNew branch through the detail screen.
 */
export function CaptureScreen({ entityRole: role, parentID, parentRole }: CaptureScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const dialog = useDialog();
  const { user } = useAuth();

  // Creation needs an account; mirror the old isNew hydration's guest redirect
  // so a logged-out user doesn't fill the form only to hit a dead Create.
  useEffect(() => {
    if (!user) router.replace({ pathname: '/login', params: { redirectTo: '/products' } });
  }, [user, router]);

  const {
    name,
    setName,
    typeID,
    setTypeID,
    amount,
    setAmount,
    images,
    setImages,
    canCreate,
    isCreating,
    isDirty,
    create,
    createAndAddAnother,
  } = useCaptureEntity({ role, parentID, parentRole });

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
  const parentQuery = isComponentParent ? componentParentQuery : baseParentQuery;

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

  const handleCreate = async () => {
    const savedId = await create();
    if (savedId === undefined) return;
    skipNextBeforeRemoveRef.current = true;
    router.replace({
      pathname: role === 'component' ? '/components/[id]' : '/products/[id]',
      params: { id: String(savedId), edit: '1' },
    });
  };

  const handleCreateAndAddAnother = async () => {
    const result = await createAndAddAnother();
    // Batch mode has nothing left to batch on a partial success: the record
    // exists and its photos need attention, so route to the detail screen
    // exactly like a plain Create instead of staying on the capture form.
    if (!result?.partial) return;
    skipNextBeforeRemoveRef.current = true;
    router.replace({
      pathname: role === 'component' ? '/components/[id]' : '/products/[id]',
      params: { id: String(result.id), edit: '1' },
    });
  };

  return (
    <KeyboardAwareScrollView
      testID="capture-scroll"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <PageContainer>
        <Stack.Screen options={{ title: role === 'component' ? 'New component' : 'New product' }} />
        <ProductImageGallery product={draftProduct} editMode onImagesChange={setImages} />
        <View className="gap-4">
          <View>
            <AppText variant="label" className="uppercase opacity-60">
              Name
            </AppText>
            <Input
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={PRODUCT_NAME_MAX_LENGTH}
              placeholder="e.g. Cordless drill"
              accessibilityLabel="Name"
              onSubmitEditing={() => {
                if (canCreate) void handleCreate();
              }}
            />
          </View>

          <CaptureTypeRow typeID={typeID} onTypeChange={setTypeID} />

          {role === 'component' ? (
            <>
              {parentQuery.data ? <AppText>Component of: {parentQuery.data.name}</AppText> : null}
              <AmountStepper value={amount} onChange={setAmount} label="Amount in parent" />
            </>
          ) : null}

          <View className="flex-row gap-3">
            {role === 'component' ? (
              <>
                <AppButton
                  variant="primary"
                  disabled={!canCreate}
                  loading={isCreating}
                  onPress={handleCreate}
                >
                  Create component
                </AppButton>
                <AppButton
                  variant="outline"
                  disabled={!canCreate}
                  loading={isCreating}
                  onPress={handleCreateAndAddAnother}
                >
                  Create & add another
                </AppButton>
              </>
            ) : (
              <AppButton
                variant="primary"
                disabled={!canCreate}
                loading={isCreating}
                onPress={handleCreate}
              >
                Create product
              </AppButton>
            )}
          </View>
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
