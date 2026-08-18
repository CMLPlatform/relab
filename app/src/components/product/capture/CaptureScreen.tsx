import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AmountStepper } from '@/components/base/AmountStepper';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { DocsLink } from '@/components/base/DocsLink';
import { PageContainer } from '@/components/base/PageContainer';
import { Input } from '@/components/base/ui/input';
import CPVCard from '@/components/product/CPVCard';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { DATA_COLLECTION_DOCS_PATH } from '@/config';
import { takePendingTypeSelection } from '@/features/products/pendingTypeSelection';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
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
    isPaused,
    draftProduct,
    parentName,
    handleCreate,
    handleCreateAndAddAnother,
  } = useCaptureScreen({ role, parentID, parentRole });

  const submitOnEnter = useCallback(() => {
    if (canCreate) void handleCreate();
  }, [canCreate, handleCreate]);

  // Offline: the mutation is paused, not "loading" — no spinner to show
  // until connectivity returns (see useCaptureEntity's isPaused wiring).
  const isQueued = isCreating && isPaused;

  const nameInputRef = useRef<TextInput>(null);
  const onCreateAndAddAnother = useCallback(async () => {
    // Only steal focus back to Name when the form was actually reset (a
    // create failure leaves the fields as typed — nothing to refocus for).
    const didReset = await handleCreateAndAddAnother();
    if (didReset) nameInputRef.current?.focus();
  }, [handleCreateAndAddAnother]);

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
              ref={nameInputRef}
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

          {/* A first-time contributor decides here what to record; the guide
              answers that, so it is one tap away rather than in Account. */}
          <DocsLink
            path={DATA_COLLECTION_DOCS_PATH}
            accessibilityLabel="Read the data collection guide"
            className="self-start py-1"
          >
            What to record, and how much
          </DocsLink>

          {role === 'component' ? (
            <>
              {parentName ? <AppText>Component of: {parentName}</AppText> : null}
              <AmountStepper value={amount} onChange={setAmount} label="How many of these" />
            </>
          ) : null}

          <View className="flex-row gap-3">
            <AppButton
              variant="primary"
              disabled={!canCreate}
              loading={isCreating && !isPaused}
              onPress={handleCreate}
            >
              {isQueued
                ? QUEUED_OFFLINE_LABEL
                : role === 'component'
                  ? 'Create component'
                  : 'Create product'}
            </AppButton>
            <AppButton
              variant="outline"
              disabled={!canCreate}
              loading={isCreating && !isPaused}
              onPress={onCreateAndAddAnother}
            >
              {isQueued ? QUEUED_OFFLINE_LABEL : 'Create & add another'}
            </AppButton>
          </View>
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
