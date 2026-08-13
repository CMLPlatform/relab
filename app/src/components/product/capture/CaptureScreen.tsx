import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AmountStepper } from '@/components/base/AmountStepper';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { PageContainer } from '@/components/base/PageContainer';
import { Input } from '@/components/base/ui/input';
import CPVCard from '@/components/product/CPVCard';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { useCaptureScreen } from '@/features/products/useCaptureScreen';
import { PRODUCT_NAME_MAX_LENGTH } from '@/services/api/validation/productSchema';
import { loadCPV } from '@/services/cpv';
import type { CPVCategory } from '@/types/CPVCategory';
import { typeRowLabels } from '@/types/Product';

type CaptureScreenProps = {
  // Named entityRole, not role: a JSX prop literally called `role` trips
  // lint/a11y/useValidAriaRole at every call site and is a live RN-Web prop
  // that would leak onto the DOM as an invalid ARIA role.
  entityRole: 'product' | 'component';
  parentID?: number;
  parentRole?: 'product' | 'component';
};

/**
 * Type row: same round-trip pattern as ProductType.tsx (pending selection slot
 * + loadCPV lookup), but driven by a plain typeID/onChange pair instead of a
 * saved product, since a capture draft has no [id] route.
 */
function CaptureTypeRow({
  typeID,
  onTypeChange,
  entityRole,
}: {
  typeID: number | undefined;
  onTypeChange: (typeID: number) => void;
  entityRole: 'product' | 'component';
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
        // Never fall back to cpv.root — its {name: "undefined"} placeholder
        // renders as a red "Category undefined" error card. An unresolvable
        // type id resolves to null (renders nothing); the typeless case is
        // handled by the `typeID === undefined` invite above.
        setSelectedType(cpv[String(typeID ?? 'root')] ?? null);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [typeID]);

  const labels = typeRowLabels(entityRole);
  const goToCategorySelection = useCallback(() => router.push('/category-selection'), [router]);

  return (
    <View>
      <AppText variant="eyebrow">{labels.title}</AppText>
      {typeID === undefined ? (
        <AppButton
          variant="outline"
          className="w-full"
          accessibilityLabel={labels.choose}
          onPress={goToCategorySelection}
        >
          {labels.choose}
        </AppButton>
      ) : selectedType ? (
        <CPVCard CPV={selectedType} onPress={goToCategorySelection} />
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
  const {
    name,
    setName,
    typeID,
    setTypeID,
    amount,
    setAmount,
    setImages,
    canCreate,
    isCreating,
    draftProduct,
    parentName,
    handleCreate,
    handleCreateAndAddAnother,
  } = useCaptureScreen({ role, parentID, parentRole });

  const submitOnEnter = useCallback(() => {
    if (canCreate) void handleCreate();
  }, [canCreate, handleCreate]);

  return (
    <KeyboardAwareScrollView
      testID="capture-scroll"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
    >
      <PageContainer>
        <ProductImageGallery product={draftProduct} editMode onImagesChange={setImages} />
        <View className="gap-4">
          <View>
            <AppText variant="eyebrow">Name</AppText>
            <Input
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={PRODUCT_NAME_MAX_LENGTH}
              placeholder="e.g. Cordless drill"
              accessibilityLabel="Name"
              onSubmitEditing={submitOnEnter}
            />
          </View>

          <CaptureTypeRow typeID={typeID} onTypeChange={setTypeID} entityRole={role} />

          {role === 'component' ? (
            <>
              {parentName ? <AppText>Component of: {parentName}</AppText> : null}
              <AmountStepper value={amount} onChange={setAmount} label="Amount in parent" />
            </>
          ) : null}

          <View className="flex-row gap-3">
            <AppButton
              variant="primary"
              disabled={!canCreate}
              loading={isCreating}
              onPress={handleCreate}
            >
              {role === 'component' ? 'Create component' : 'Create product'}
            </AppButton>
            <AppButton
              variant="outline"
              disabled={!canCreate}
              loading={isCreating}
              onPress={handleCreateAndAddAnother}
            >
              Create & add another
            </AppButton>
          </View>
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
